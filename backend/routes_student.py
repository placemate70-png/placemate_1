import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import storage
from ai_service import (
    ai_narrative,
    ai_roadmap,
    compute_gaps,
    compute_overall,
    gap_level,
    readiness_from_score,
)
from assessments import ASSESSMENTS, ASSESSMENT_BY_ID, ROLE_REQUIREMENTS, grade, public_assessment
from auth import create_file_token, log_action, require_role
from database import get_session
from db_models import (
    Application,
    AssessmentAttempt,
    FileRecord,
    Job,
    ProgressLog,
    Recommendation,
    Roadmap,
    SkillGap,
    SkillGapReport,
    StudentProfile,
    User,
)
from models import AnalyzeRequest, AssessmentSubmit, ProfileUpdate, ProgressUpdate, now_iso
from resume_parser import parse_resume
from vector_service import profile_document, recommend_roles, upsert_student

router = APIRouter(prefix="/api/student", tags=["student"])
student_only = require_role("student")
MAX_RESUME_BYTES = 5 * 1024 * 1024

PROFILE_FIELDS = (
    "id", "user_id", "institution_id", "department", "roll_number", "degree", "graduation_year",
    "cgpa", "target_role", "headline", "skills", "projects_count", "internships_count",
    "resume_file_id", "resume_filename", "share_consent", "readiness_override",
    "coordinator_note", "updated_at",
)
REPORT_FIELDS = (
    "id", "user_id", "target_role", "overall_score", "readiness", "gaps",
    "strengths", "recommendations", "summary", "provider", "created_at",
)
JOB_FIELDS = (
    "id", "institution_id", "created_by", "title", "company", "description", "location", "ctc",
    "departments", "required_skills", "min_cgpa", "deadline", "is_open", "created_at",
)
ROADMAP_FIELDS = ("id", "user_id", "target_role", "steps", "summary", "provider", "created_at")
VALID_PROGRESS = {"pending", "in_progress", "completed"}


def as_dict(obj, fields) -> dict:
    return {f: getattr(obj, f) for f in fields}


async def get_profile(session: AsyncSession, user_id: str) -> StudentProfile:
    profile = (
        await session.execute(select(StudentProfile).where(StudentProfile.user_id == user_id))
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


async def skill_levels_for(session: AsyncSession, user_id: str) -> dict:
    levels: dict = {}
    attempts = (
        await session.execute(select(AssessmentAttempt).where(AssessmentAttempt.user_id == user_id))
    ).scalars().all()
    for attempt in attempts:
        for skill, score in (attempt.skill_scores or {}).items():
            levels[skill] = max(levels.get(skill, 0), score)
    return levels


async def build_report(session: AsyncSession, user: User, target_role: Optional[str]) -> SkillGapReport:
    profile = await get_profile(session, user.id)
    role = target_role or profile.target_role or next(iter(ROLE_REQUIREMENTS))
    if role not in ROLE_REQUIREMENTS:
        raise HTTPException(status_code=400, detail="Unsupported target role")
    levels = await skill_levels_for(session, user.id)
    if not levels:
        raise HTTPException(status_code=400, detail="Complete at least one assessment before running the analysis")

    computed = compute_gaps(role, levels)
    attempts_count = int(await session.scalar(
        select(func.count()).select_from(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id)
    ) or 0)
    profile_dict = as_dict(profile, PROFILE_FIELDS)
    score = compute_overall(computed["skill_match"], profile_dict, attempts_count)
    narrative = await ai_narrative(role, computed["gaps"], score, profile_dict)

    report = SkillGapReport(
        user_id=user.id,
        target_role=role,
        overall_score=score,
        readiness=readiness_from_score(score),
        gaps=computed["gaps"],
        strengths=computed["strengths"],
        recommendations=narrative["recommendations"],
        summary=narrative["summary"],
        provider=narrative["provider"],
    )
    session.add(report)
    profile.target_role = role
    profile.updated_at = now_iso()
    await session.flush()

    await sync_skill_gaps(session, user.id, computed["gaps"], narrative["recommendations"])
    # Keep the student's embedding current so role recommendations reflect the
    # latest assessment results.
    upsert_student(
        user.id,
        profile_document(profile.skills or [], levels, profile.headline or ""),
        profile.department,
    )
    return report


async def sync_skill_gaps(session: AsyncSession, user_id: str, gaps: list, recommendations: list) -> None:
    """Flatten report gaps into skill_gaps rows and seed progress_logs.

    The report JSON stays authoritative; these rows exist so coordinator batch
    analytics can aggregate deficiencies in SQL across a whole department.
    """
    existing_gaps = {
        row.skill: row
        for row in (
            await session.execute(select(SkillGap).where(SkillGap.student_id == user_id))
        ).scalars().all()
    }
    existing_progress = {
        row.skill
        for row in (
            await session.execute(select(ProgressLog).where(ProgressLog.student_id == user_id))
        ).scalars().all()
    }
    hint = recommendations[0] if recommendations else ""

    for gap in gaps:
        level = gap_level(gap)
        row = existing_gaps.get(gap["skill"])
        if row:
            row.gap_level = level
            row.recommendation = hint if level > 0 else ""
            row.updated_at = now_iso()
        else:
            session.add(
                SkillGap(
                    student_id=user_id,
                    skill=gap["skill"],
                    gap_level=level,
                    recommendation=hint if level > 0 else "",
                )
            )
        # Only seed a progress row for skills that actually need work; never
        # overwrite a status the student has already advanced.
        if level > 0 and gap["skill"] not in existing_progress:
            session.add(ProgressLog(student_id=user_id, skill=gap["skill"], status="pending"))
    await session.flush()


@router.get("/meta")
async def meta(
    recommend: bool = Query(False, description="Rank roles by fit (runs a vector query)"),
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    """Role catalogue, ordered best-fit first once the student has assessment data.

    Ordering here is what surfaces suitable-role recommendations through the
    existing target-role selector without any UI change.
    """
    roles = list(ROLE_REQUIREMENTS.keys())
    recommended = []
    levels = await skill_levels_for(session, user.id)
    # Role ranking runs a ChromaDB embedding query, which is wasted work on the
    # dashboard's boot call. The Career tab asks for it explicitly via ?recommend=1.
    if levels and recommend:
        profile = (
            await session.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
        ).scalar_one_or_none()
        recommended = recommend_roles(
            (profile.skills if profile else []) or [], levels, (profile.headline if profile else "") or ""
        )
        roles = [r["role"] for r in recommended]
    return {
        "roles": roles,
        "role_requirements": ROLE_REQUIREMENTS,
        "recommended_roles": recommended,
        # Assessed levels, so the client can chart "you vs required" without a
        # second round trip.
        "skill_levels": levels,
    }


@router.get("/profile")
async def read_profile(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    profile = await get_profile(session, user.id)
    attempts = int(await session.scalar(
        select(func.count()).select_from(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id)
    ) or 0)
    report = (
        await session.execute(
            select(SkillGapReport)
            .where(SkillGapReport.user_id == user.id)
            .order_by(SkillGapReport.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return {
        "profile": as_dict(profile, PROFILE_FIELDS),
        "attempts": attempts,
        "latest_report": as_dict(report, REPORT_FIELDS) if report else None,
        "effective_readiness": profile.readiness_override or (report.readiness if report else "NOT_STARTED"),
    }


@router.put("/profile")
async def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    updates = payload.model_dump(exclude_none=True)
    if "cgpa" in updates and not (0 <= float(updates["cgpa"]) <= 10):
        raise HTTPException(status_code=400, detail="CGPA must be between 0 and 10")
    if "target_role" in updates and updates["target_role"] not in ROLE_REQUIREMENTS:
        raise HTTPException(status_code=400, detail="Unsupported target role")
    profile = await get_profile(session, user.id)

    # Roll number is write-once and unique within an institution: it is the
    # identifier coordinators match students against, so it must not be editable
    # or duplicated after the fact.
    if "roll_number" in updates:
        incoming = (updates["roll_number"] or "").strip()
        if profile.roll_number and incoming != profile.roll_number:
            raise HTTPException(
                status_code=400,
                detail="Roll number cannot be changed once set. Contact your placement coordinator to correct it.",
            )
        if incoming and incoming != profile.roll_number:
            clash = (
                await session.execute(
                    select(StudentProfile).where(
                        StudentProfile.institution_id == profile.institution_id,
                        StudentProfile.roll_number == incoming,
                        StudentProfile.user_id != user.id,
                    )
                )
            ).scalar_one_or_none()
            if clash:
                raise HTTPException(
                    status_code=400, detail=f"Roll number {incoming} is already registered at your institution"
                )
        updates["roll_number"] = incoming or None
    for key, value in updates.items():
        setattr(profile, key, value)
    profile.updated_at = now_iso()
    await session.flush()
    return as_dict(profile, PROFILE_FIELDS)


@router.post("/resume")
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    if (file.content_type or "") != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are accepted")
    data = await file.read()
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=400, detail="Resume must be under 5 MB")
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    path = f"{storage.APP_NAME}/resumes/{user.id}/{uuid.uuid4()}.pdf"
    try:
        result = storage.put_object(path, data, "application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Resume storage unavailable: {exc}")

    record = FileRecord(
        owner_id=user.id,
        storage_path=result["path"],
        original_filename=file.filename,
        content_type="application/pdf",
        size=result.get("size", len(data)),
        is_deleted=False,
    )
    session.add(record)
    await session.flush()

    profile = await get_profile(session, user.id)
    profile.resume_file_id = record.id
    profile.resume_filename = file.filename

    # Parse the PDF and prefill the profile. Existing values are never
    # overwritten — parsing augments what the student entered, it does not
    # replace it (they can always edit skills by hand afterwards).
    parsed = parse_resume(data)
    if parsed.get("parsed"):
        merged = list(profile.skills or [])
        added = [s for s in parsed["skills"] if s not in merged]
        if added:
            profile.skills = merged + added
        if profile.degree is None and parsed.get("degree"):
            profile.degree = parsed["degree"]
        if profile.cgpa is None and parsed.get("cgpa") is not None:
            profile.cgpa = parsed["cgpa"]
        if profile.graduation_year is None and parsed.get("graduation_year"):
            profile.graduation_year = parsed["graduation_year"]
        parsed["skills_added"] = added

    profile.updated_at = now_iso()
    await session.flush()

    await log_action(
        session, user, "resume_upload", "file", record.id,
        {"filename": file.filename, "skills_found": len(parsed.get("skills") or [])},
    )
    return {"file_id": record.id, "filename": file.filename, "size": record.size, "parsed": parsed}


@router.get("/resume/link")
async def resume_link(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    profile = await get_profile(session, user.id)
    if not profile.resume_file_id:
        raise HTTPException(status_code=404, detail="No resume uploaded yet")
    return {
        "download_token": create_file_token(profile.resume_file_id),
        "filename": profile.resume_filename,
        "expires_in_seconds": 300,
    }


@router.get("/assessments")
async def list_assessments(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    attempts: dict = {}
    rows = (
        await session.execute(select(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id))
    ).scalars().all()
    for attempt in rows:
        best = attempts.get(attempt.assessment_id)
        if not best or attempt.correct > best["correct"]:
            attempts[attempt.assessment_id] = {
                "correct": attempt.correct,
                "total": attempt.total,
                "submitted_at": attempt.submitted_at,
            }
    items = []
    for assessment in ASSESSMENTS:
        summary = public_assessment(assessment)
        summary.pop("questions")
        summary["attempt"] = attempts.get(assessment["id"])
        items.append(summary)
    return items


@router.get("/assessments/{assessment_id}")
async def read_assessment(assessment_id: str, user: User = Depends(student_only)):
    assessment = ASSESSMENT_BY_ID.get(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return public_assessment(assessment)


@router.post("/assessments/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: str,
    payload: AssessmentSubmit,
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    if assessment_id not in ASSESSMENT_BY_ID:
        raise HTTPException(status_code=404, detail="Assessment not found")
    correct, total, skill_scores = grade(assessment_id, payload.answers)
    session.add(
        AssessmentAttempt(
            user_id=user.id,
            assessment_id=assessment_id,
            kind=ASSESSMENT_BY_ID[assessment_id].get("kind", "aptitude"),
            correct=correct,
            total=total,
            skill_scores=skill_scores,
        )
    )
    await session.flush()

    # The brief requires recommendations to update after EVERY assessment, so
    # re-run the analysis instead of waiting for the student to press a button.
    # Only refresh students who already have a report — a first-timer still gets
    # the explicit "run the analysis" flow.
    refreshed = None
    previous = (
        await session.execute(
            select(SkillGapReport)
            .where(SkillGapReport.user_id == user.id)
            .order_by(SkillGapReport.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if previous:
        try:
            report = await build_report(session, user, previous.target_role)
            refreshed = {
                "overall_score": report.overall_score,
                "readiness": report.readiness,
                "previous_score": previous.overall_score,
                "delta": report.overall_score - previous.overall_score,
            }
        except HTTPException:
            refreshed = None

    return {
        "correct": correct,
        "total": total,
        "skill_scores": skill_scores,
        "percentage": round(100 * correct / total),
        "refreshed_report": refreshed,
    }


@router.post("/analyze")
async def analyze(
    payload: AnalyzeRequest,
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    report = await build_report(session, user, payload.target_role)
    return as_dict(report, REPORT_FIELDS)


@router.get("/gamification")
async def gamification(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    """XP, level, streak and badges — all derived from real recorded activity.

    Nothing here is stored or simulated: every number is computed from the
    student's actual assessment attempts, reports, roadmaps and task progress, so
    it cannot drift out of sync with what they really did.
    """
    profile = await get_profile(session, user.id)

    attempts = (
        await session.execute(select(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id))
    ).scalars().all()
    reports = (
        await session.execute(
            select(SkillGapReport).where(SkillGapReport.user_id == user.id).order_by(SkillGapReport.created_at)
        )
    ).scalars().all()
    logs = (
        await session.execute(select(ProgressLog).where(ProgressLog.student_id == user.id))
    ).scalars().all()
    roadmaps = (
        await session.execute(select(Roadmap).where(Roadmap.user_id == user.id))
    ).scalars().all()

    completed_tasks = [log for log in logs if log.status == "completed"]
    best = max((r.overall_score for r in reports), default=0)
    distinct_assessments = {a.assessment_id for a in attempts}

    xp = (
        len(attempts) * 100
        + len(reports) * 50
        + len(completed_tasks) * 75
        + len(roadmaps) * 100
        + (150 if profile.resume_file_id else 0)
    )

    LEVELS = [
        ("Novice", 0), ("Learner", 500), ("Skilled", 1500), ("Pro", 3000), ("Placement Ready", 5000),
    ]
    level, level_floor = LEVELS[0]
    next_level, next_xp = None, None
    for index, (name, floor) in enumerate(LEVELS):
        if xp >= floor:
            level, level_floor = name, floor
            nxt = LEVELS[index + 1] if index + 1 < len(LEVELS) else None
            next_level, next_xp = (nxt[0], nxt[1]) if nxt else (None, None)

    # Activity streak: distinct UTC days with any recorded action, counted back
    # from today. A gap of more than one day ends the streak.
    stamps = (
        [a.submitted_at for a in attempts]
        + [r.created_at for r in reports]
        + [m.created_at for m in roadmaps]
        + [log.updated_at for log in logs]
    )
    days = set()
    for stamp in stamps:
        try:
            days.add(datetime.fromisoformat(stamp).date())
        except (TypeError, ValueError):
            continue
    today = datetime.now(timezone.utc).date()
    streak = 0
    if days:
        cursor = today if today in days else today - timedelta(days=1)
        while cursor in days:
            streak += 1
            cursor -= timedelta(days=1)

    # Every badge maps to a fact that is verifiable in the database.
    badge_defs = [
        ("first_resume", "First Resume", "Uploaded a resume", bool(profile.resume_file_id)),
        ("first_analysis", "First Analysis", "Ran a skill-gap analysis", len(reports) >= 1),
        ("assessor", "Assessor", "Completed 3 assessments", len(attempts) >= 3),
        ("full_sweep", "Full Sweep", "Attempted every assessment set", len(distinct_assessments) >= 4),
        ("perfect_score", "Perfect Score", "Scored 100% on an assessment",
         any(a.total and a.correct == a.total for a in attempts)),
        ("roadmap_built", "Roadmap Built", "Generated a preparation roadmap", len(roadmaps) >= 1),
        ("task_finisher", "Task Finisher", "Completed a roadmap task", len(completed_tasks) >= 1),
        ("halfway", "Halfway There", "Reached a readiness score of 50", best >= 50),
        ("placement_ready", "Placement Ready", "Reached a readiness score of 80", best >= 80),
    ]

    return {
        "xp": xp,
        "level": level,
        "level_floor": level_floor,
        "next_level": next_level,
        "next_level_xp": next_xp,
        "level_progress": (
            int(round(100 * (xp - level_floor) / (next_xp - level_floor))) if next_xp else 100
        ),
        "streak_days": streak,
        "active_days": len(days),
        "best_score": best,
        "stats": {
            "assessments_taken": len(attempts),
            "analyses_run": len(reports),
            "roadmaps_built": len(roadmaps),
            "tasks_completed": len(completed_tasks),
            "tasks_total": len(logs),
        },
        "badges": [
            {"id": bid, "name": name, "description": desc, "earned": bool(earned)}
            for bid, name, desc, earned in badge_defs
        ],
        "badges_earned": sum(1 for *_, earned in badge_defs if earned),
    }


@router.get("/role-recommendations")
async def role_recommendations(
    user: User = Depends(student_only), session: AsyncSession = Depends(get_session)
):
    """Suitable-role recommendations ranked by hybrid deterministic + vector fit."""
    profile = await get_profile(session, user.id)
    levels = await skill_levels_for(session, user.id)
    if not levels:
        raise HTTPException(
            status_code=400, detail="Complete at least one assessment to get role recommendations"
        )
    return {
        "recommendations": recommend_roles(profile.skills or [], levels, profile.headline or ""),
        "current_target": profile.target_role,
    }


@router.post("/roadmap")
async def generate_roadmap(
    payload: AnalyzeRequest,
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    """Generate a personalized preparation roadmap with learning resources."""
    profile = await get_profile(session, user.id)
    role = payload.target_role or profile.target_role
    if not role or role not in ROLE_REQUIREMENTS:
        raise HTTPException(status_code=400, detail="Set a valid target role first")
    levels = await skill_levels_for(session, user.id)
    if not levels:
        raise HTTPException(status_code=400, detail="Complete at least one assessment before building a roadmap")

    computed = compute_gaps(role, levels)
    attempts_count = int(await session.scalar(
        select(func.count()).select_from(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id)
    ) or 0)
    score = compute_overall(computed["skill_match"], as_dict(profile, PROFILE_FIELDS), attempts_count)
    generated = await ai_roadmap(role, computed["gaps"], score, as_dict(profile, PROFILE_FIELDS))

    roadmap = Roadmap(
        user_id=user.id,
        target_role=role,
        steps=generated["steps"],
        summary=generated["summary"],
        provider=generated["provider"],
    )
    session.add(roadmap)
    await session.flush()
    return as_dict(roadmap, ROADMAP_FIELDS)


@router.get("/roadmap")
async def latest_roadmap(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    roadmap = (
        await session.execute(
            select(Roadmap)
            .where(Roadmap.user_id == user.id)
            .order_by(Roadmap.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return as_dict(roadmap, ROADMAP_FIELDS) if roadmap else None


@router.get("/progress")
async def read_progress(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    """Per-skill preparation progress, joined with the current gap level."""
    logs = (
        await session.execute(select(ProgressLog).where(ProgressLog.student_id == user.id))
    ).scalars().all()
    if not logs:
        # Backfill from the latest report. Students who were seeded or migrated
        # already have reports but never went through sync_skill_gaps, so
        # derive their gap and progress rows on first read.
        report = (
            await session.execute(
                select(SkillGapReport)
                .where(SkillGapReport.user_id == user.id)
                .order_by(SkillGapReport.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if report and report.gaps:
            await sync_skill_gaps(session, user.id, report.gaps, report.recommendations or [])
            logs = (
                await session.execute(select(ProgressLog).where(ProgressLog.student_id == user.id))
            ).scalars().all()
    gaps = {
        g.skill: g
        for g in (
            await session.execute(select(SkillGap).where(SkillGap.student_id == user.id))
        ).scalars().all()
    }
    items = [
        {
            "id": log.id,
            "skill": log.skill,
            "status": log.status,
            "gap_level": gaps[log.skill].gap_level if log.skill in gaps else None,
            "recommendation": gaps[log.skill].recommendation if log.skill in gaps else "",
            "updated_at": log.updated_at,
        }
        for log in logs
    ]
    items.sort(key=lambda i: (i["status"] == "completed", -(i["gap_level"] or 0)))
    completed = sum(1 for i in items if i["status"] == "completed")
    return {
        "items": items,
        "total": len(items),
        "completed": completed,
        "percent_complete": int(round(100 * completed / len(items))) if items else 0,
    }


@router.put("/progress/{skill}")
async def update_progress(
    skill: str,
    payload: ProgressUpdate,
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    if payload.status not in VALID_PROGRESS:
        raise HTTPException(status_code=400, detail=f"Status must be one of {', '.join(sorted(VALID_PROGRESS))}")
    log = (
        await session.execute(
            select(ProgressLog).where(ProgressLog.student_id == user.id, ProgressLog.skill == skill)
        )
    ).scalar_one_or_none()
    if not log:
        log = ProgressLog(student_id=user.id, skill=skill)
        session.add(log)
    log.status = payload.status
    log.updated_at = now_iso()
    await session.flush()
    return {"skill": skill, "status": log.status, "updated_at": log.updated_at}


@router.get("/reports")
async def reports(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(SkillGapReport)
            .where(SkillGapReport.user_id == user.id)
            .order_by(SkillGapReport.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    return [as_dict(r, REPORT_FIELDS) for r in rows]


@router.get("/jobs")
async def jobs(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    profile = await get_profile(session, user.id)
    rows = (
        await session.execute(
            select(Job)
            .where(Job.institution_id == user.institution_id, Job.is_open.is_(True))
            .order_by(Job.created_at.desc())
        )
    ).scalars().all()
    applied = {
        a.job_id
        for a in (
            await session.execute(select(Application).where(Application.student_id == user.id))
        ).scalars().all()
    }
    items = []
    for job in rows:
        # departments is a JSON array; filter in Python so the query stays portable
        # across Postgres and the SQLite test database.
        departments = job.departments or []
        if departments and profile.department not in departments:
            continue
        data = as_dict(job, JOB_FIELDS)
        data["has_applied"] = job.id in applied
        items.append(data)
    return items


@router.post("/jobs/{job_id}/apply")
async def apply(
    job_id: str,
    user: User = Depends(student_only),
    session: AsyncSession = Depends(get_session),
):
    profile = await get_profile(session, user.id)
    job = (
        await session.execute(
            select(Job).where(Job.id == job_id, Job.institution_id == user.institution_id)
        )
    ).scalar_one_or_none()
    if not job or not job.is_open:
        raise HTTPException(status_code=404, detail="Job not available")
    if job.departments and profile.department not in job.departments:
        raise HTTPException(status_code=403, detail="This opening is not open to your department")
    if job.min_cgpa and (profile.cgpa or 0) < job.min_cgpa:
        raise HTTPException(status_code=400, detail=f"Minimum CGPA for this role is {job.min_cgpa}")
    if not profile.resume_file_id:
        raise HTTPException(status_code=400, detail="Upload your resume before applying")
    existing = (
        await session.execute(
            select(Application).where(Application.job_id == job_id, Application.student_id == user.id)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="You have already applied to this opening")
    application = Application(
        job_id=job_id, student_id=user.id, institution_id=user.institution_id, department=profile.department
    )
    session.add(application)
    await session.flush()
    return {
        "id": application.id,
        "job_id": application.job_id,
        "student_id": application.student_id,
        "institution_id": application.institution_id,
        "department": application.department,
        "status": application.status,
        "applied_at": application.applied_at,
    }


@router.get("/applications")
async def applications(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(Application)
            .where(Application.student_id == user.id)
            .order_by(Application.applied_at.desc())
        )
    ).scalars().all()
    jobs_by_id = {
        j.id: j
        for j in (
            await session.execute(select(Job).where(Job.id.in_([a.job_id for a in rows])))
        ).scalars().all()
    } if rows else {}
    items = []
    for app_row in rows:
        job = jobs_by_id.get(app_row.job_id)
        items.append(
            {
                "id": app_row.id,
                "job_id": app_row.job_id,
                "student_id": app_row.student_id,
                "institution_id": app_row.institution_id,
                "department": app_row.department,
                "status": app_row.status,
                "applied_at": app_row.applied_at,
                "job": {"title": job.title, "company": job.company, "location": job.location} if job else None,
            }
        )
    return items


@router.get("/recommendations")
async def recommendations(user: User = Depends(student_only), session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(Recommendation)
            .where(Recommendation.student_id == user.id)
            .order_by(Recommendation.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    jobs_by_id = {
        j.id: j
        for j in (
            await session.execute(select(Job).where(Job.id.in_([r.job_id for r in rows])))
        ).scalars().all()
    } if rows else {}
    items = []
    for rec in rows:
        job = jobs_by_id.get(rec.job_id)
        items.append(
            {
                "id": rec.id,
                "student_id": rec.student_id,
                "job_id": rec.job_id,
                "coordinator_id": rec.coordinator_id,
                "note": rec.note,
                "created_at": rec.created_at,
                "job": {"title": job.title, "company": job.company} if job else None,
            }
        )
    return items
