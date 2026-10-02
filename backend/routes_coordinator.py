from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import create_file_token, log_action, require_role
from database import get_session
from db_models import (
    Application,
    AssessmentAttempt,
    Institution,
    Job,
    ProgressLog,
    Recommendation,
    SkillGap,
    SkillGapReport,
    StudentProfile,
    User,
)
from models import ApprovalUpdate, JobInput, ReadinessUpdate, RecommendRequest, now_iso

router = APIRouter(prefix="/api/coordinator", tags=["coordinator"])
coordinator_only = require_role("coordinator")
VALID_READINESS = {"READY", "ALMOST_READY", "DEVELOPING", "NOT_READY"}
VALID_APPROVAL = {"pending", "approved", "rejected"}

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


def as_dict(obj, fields) -> dict:
    return {f: getattr(obj, f) for f in fields}


def scope_where(user: User):
    return (
        StudentProfile.institution_id == user.institution_id,
        StudentProfile.department == user.department,
    )


async def scoped_profile(session: AsyncSession, user: User, student_id: str) -> StudentProfile:
    profile = (
        await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == student_id, *scope_where(user))
        )
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=403, detail="Student is outside your institution/department scope")
    # Consent no longer gates access: a verified coordinator may review any
    # student in their own institution + department. Institution/department
    # scoping and audit logging remain the controls.
    return profile


async def latest_report(session: AsyncSession, user_id: str) -> Optional[SkillGapReport]:
    return (
        await session.execute(
            select(SkillGapReport)
            .where(SkillGapReport.user_id == user_id)
            .order_by(SkillGapReport.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def latest_reports_for(session: AsyncSession, user_ids: list) -> dict:
    """Latest report per user in ONE query instead of one query per student.

    Every round trip to the pooler costs ~250ms, so the per-student query this
    replaces was the single biggest cost in the coordinator views.
    """
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(SkillGapReport)
            .where(SkillGapReport.user_id.in_(user_ids))
            .order_by(SkillGapReport.created_at.desc())
        )
    ).scalars().all()
    latest: dict = {}
    for row in rows:                      # already newest-first; keep the first seen
        latest.setdefault(row.user_id, row)
    return latest


async def users_by_id(session: AsyncSession, user_ids: list) -> dict:
    if not user_ids:
        return {}
    rows = (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    return {u.id: u for u in rows}


@router.get("/scope")
async def read_scope(user: User = Depends(coordinator_only), session: AsyncSession = Depends(get_session)):
    institution = await session.get(Institution, user.institution_id)
    total = int(await session.scalar(
        select(func.count()).select_from(StudentProfile).where(*scope_where(user))
    ) or 0)
    with_resume = int(await session.scalar(
        select(func.count()).select_from(StudentProfile).where(
            *scope_where(user), StudentProfile.resume_file_id.is_not(None)
        )
    ) or 0)
    return {
        "institution_id": user.institution_id,
        "institution_name": institution.name if institution else None,
        "department": user.department,
        "students_total": total,
        "students_with_resume": with_resume,
    }


@router.get("/overview")
async def overview(user: User = Depends(coordinator_only), session: AsyncSession = Depends(get_session)):
    profiles = (
        await session.execute(select(StudentProfile).where(*scope_where(user)))
    ).scalars().all()
    buckets = {"READY": 0, "ALMOST_READY": 0, "DEVELOPING": 0, "NOT_READY": 0, "NOT_STARTED": 0}
    scores = []
    resumes = 0
    reports = await latest_reports_for(session, [p.user_id for p in profiles])
    for profile in profiles:
        report = reports.get(profile.user_id)
        label = profile.readiness_override or (report.readiness if report else "NOT_STARTED")
        buckets[label] = buckets.get(label, 0) + 1
        if report:
            scores.append(report.overall_score)
        if profile.resume_file_id:
            resumes += 1
    jobs_open = int(await session.scalar(
        select(func.count()).select_from(Job).where(
            Job.institution_id == user.institution_id, Job.is_open.is_(True)
        )
    ) or 0)
    applications = int(await session.scalar(
        select(func.count()).select_from(Application).where(
            Application.institution_id == user.institution_id, Application.department == user.department
        )
    ) or 0)
    return {
        "students": len(profiles),
        "resumes_uploaded": resumes,
        "average_score": round(sum(scores) / len(scores)) if scores else 0,
        "readiness_breakdown": buckets,
        "open_jobs": jobs_open,
        "applications": applications,
    }


@router.get("/pending-students")
async def pending_students(
    status: str = Query("pending", description="pending | rejected | approved | ALL"),
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    """Student registrations awaiting this coordinator's decision.

    Scoped to the coordinator's own institution AND department — the same rule
    that governs every other coordinator view.
    """
    stmt = select(User).where(
        User.role == "student",
        User.institution_id == user.institution_id,
        User.department == user.department,
    )
    if status and status != "ALL":
        stmt = stmt.where(User.approval_status == status)
    rows = (await session.execute(stmt.order_by(User.created_at.desc()))).scalars().all()

    approvers = await users_by_id(session, [r.approved_by for r in rows if r.approved_by])
    return [
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "phone": row.phone,
            "department": row.department,
            "is_verified": row.is_verified,
            "approval_status": row.approval_status,
            "rejection_reason": row.rejection_reason,
            "approved_at": row.approved_at,
            "approved_by_name": approvers[row.approved_by].name if row.approved_by in approvers else None,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.put("/students/{student_id}/approval")
async def set_student_approval(
    student_id: str,
    payload: ApprovalUpdate,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    if payload.status not in VALID_APPROVAL:
        raise HTTPException(status_code=400, detail=f"Status must be one of {', '.join(sorted(VALID_APPROVAL))}")

    target = (
        await session.execute(
            select(User).where(
                User.id == student_id,
                User.role == "student",
                User.institution_id == user.institution_id,
                User.department == user.department,
            )
        )
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=403, detail="Student is outside your institution/department scope")

    previous = target.approval_status
    target.approval_status = payload.status
    target.approved_by = user.id
    target.approved_at = now_iso()
    target.rejection_reason = payload.reason if payload.status == "rejected" else None
    await session.flush()

    await log_action(
        session, user, f"student_{payload.status}", "user", student_id,
        {"email": target.email, "from": previous, "to": payload.status, "reason": payload.reason},
    )
    return {
        "id": student_id,
        "approval_status": target.approval_status,
        "approved_at": target.approved_at,
        "rejection_reason": target.rejection_reason,
    }


@router.get("/analytics")
async def analytics(user: User = Depends(coordinator_only), session: AsyncSession = Depends(get_session)):
    """Batch-level readiness: common skill deficiencies plus a student x skill heatmap.

    Aggregates the flattened skill_gaps rows rather than unpacking every
    student's report JSON, which is why those rows exist.
    """
    profiles = (
        await session.execute(select(StudentProfile).where(*scope_where(user)))
    ).scalars().all()
    student_ids = [p.user_id for p in profiles]
    if not student_ids:
        return {"cohort_size": 0, "common_deficiencies": [], "heatmap": {"skills": [], "rows": []},
                "progress": {"pending": 0, "in_progress": 0, "completed": 0}}

    gap_rows = (
        await session.execute(select(SkillGap).where(SkillGap.student_id.in_(student_ids)))
    ).scalars().all()

    # Students seeded or migrated before skill_gaps existed have a report but no
    # flattened rows. Backfill them once so the cohort view is complete.
    missing = set(student_ids) - {row.student_id for row in gap_rows}
    if missing:
        from routes_student import sync_skill_gaps

        backfilled = False
        for student_id in missing:
            report = await latest_report(session, student_id)
            if report and report.gaps:
                await sync_skill_gaps(session, student_id, report.gaps, report.recommendations or [])
                backfilled = True
        if backfilled:
            gap_rows = (
                await session.execute(select(SkillGap).where(SkillGap.student_id.in_(student_ids)))
            ).scalars().all()

    # Common deficiencies: how many students are behind on each skill, and by how much.
    by_skill: dict = {}
    for row in gap_rows:
        bucket = by_skill.setdefault(row.skill, {"levels": [], "affected": 0})
        bucket["levels"].append(row.gap_level)
        if row.gap_level > 0:
            bucket["affected"] += 1

    cohort = len(student_ids)
    common = [
        {
            "skill": skill,
            "students_affected": data["affected"],
            "affected_percent": int(round(100 * data["affected"] / cohort)),
            "average_gap": int(round(sum(data["levels"]) / len(data["levels"]))) if data["levels"] else 0,
        }
        for skill, data in by_skill.items()
    ]
    common.sort(key=lambda c: (-c["average_gap"], -c["students_affected"]))

    # Heatmap: one row per student, one cell per skill (gap_level 0-100).
    skills = [c["skill"] for c in common]
    names = {
        u.id: u.name
        for u in (
            await session.execute(select(User).where(User.id.in_(student_ids)))
        ).scalars().all()
    }
    cells: dict = {}
    for row in gap_rows:
        cells.setdefault(row.student_id, {})[row.skill] = row.gap_level

    rows = []
    for profile in profiles:
        student_cells = cells.get(profile.user_id, {})
        if not student_cells:
            continue
        rows.append(
            {
                "student_id": profile.user_id,
                "name": names.get(profile.user_id),
                "values": [student_cells.get(skill) for skill in skills],
                "average_gap": int(round(sum(student_cells.values()) / len(student_cells))),
            }
        )
    rows.sort(key=lambda r: -r["average_gap"])

    progress_rows = (
        await session.execute(select(ProgressLog).where(ProgressLog.student_id.in_(student_ids)))
    ).scalars().all()
    tally = {"pending": 0, "in_progress": 0, "completed": 0}
    for row in progress_rows:
        if row.status in tally:
            tally[row.status] += 1

    return {
        "cohort_size": cohort,
        "students_analysed": len(rows),
        "common_deficiencies": common[:12],
        "heatmap": {"skills": skills, "rows": rows},
        "progress": tally,
    }


@router.get("/students")
async def students(
    search: Optional[str] = Query(None),
    readiness: Optional[str] = Query(None),
    min_score: Optional[int] = Query(None),
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    profiles = (
        await session.execute(select(StudentProfile).where(*scope_where(user)))
    ).scalars().all()
    # Batch the two lookups that were previously per-student: 1 + 2N queries -> 3.
    ids = [p.user_id for p in profiles]
    accounts = await users_by_id(session, ids)
    reports = await latest_reports_for(session, ids)

    items = []
    for profile in profiles:
        account = accounts.get(profile.user_id)
        if not account:
            continue
        report = reports.get(profile.user_id)
        label = profile.readiness_override or (report.readiness if report else "NOT_STARTED")
        row = {
            "student_id": profile.user_id,
            "name": account.name,
            "email": account.email,
            "department": profile.department,
            "roll_number": profile.roll_number,
            "target_role": profile.target_role,
            "cgpa": profile.cgpa,
            "score": report.overall_score if report else None,
            "readiness": label,
            "has_resume": bool(profile.resume_file_id),
            "share_consent": profile.share_consent,
            "readiness_override": profile.readiness_override,
        }
        if search and search.lower() not in f"{account.name} {profile.roll_number or ''}".lower():
            continue
        if readiness and readiness != "ALL" and label != readiness:
            continue
        if min_score is not None and (row["score"] or 0) < min_score:
            continue
        items.append(row)
    items.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    return items


@router.get("/students/{student_id}")
async def student_detail(
    student_id: str,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    profile = await scoped_profile(session, user, student_id)
    account = await session.get(User, student_id)
    report = await latest_report(session, student_id)
    await log_action(session, user, "view_student_score", "student", student_id, {"department": profile.department})
    attempts = (
        await session.execute(
            select(AssessmentAttempt)
            .where(AssessmentAttempt.user_id == student_id)
            .order_by(AssessmentAttempt.submitted_at.desc())
            .limit(50)
        )
    ).scalars().all()
    applications = (
        await session.execute(select(Application).where(Application.student_id == student_id))
    ).scalars().all()
    job_titles = []
    for app_row in applications:
        job = await session.get(Job, app_row.job_id)
        if job:
            job_titles.append({"title": job.title, "company": job.company, "status": app_row.status})
    return {
        "student_id": student_id,
        "name": account.name if account else None,
        "email": account.email if account else None,
        "phone": account.phone if account else None,
        "profile": as_dict(profile, PROFILE_FIELDS),
        "report": as_dict(report, REPORT_FIELDS) if report else None,
        "attempts": [
            {
                "assessment_id": a.assessment_id,
                "correct": a.correct,
                "total": a.total,
                "submitted_at": a.submitted_at,
            }
            for a in attempts
        ],
        "applications": job_titles,
    }


@router.get("/students/{student_id}/resume-link")
async def resume_link(
    student_id: str,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    profile = await scoped_profile(session, user, student_id)
    if not profile.resume_file_id:
        raise HTTPException(status_code=404, detail="Student has not uploaded a resume")
    await log_action(session, user, "view_resume", "student", student_id, {"file_id": profile.resume_file_id})
    return {
        "download_token": create_file_token(profile.resume_file_id),
        "filename": profile.resume_filename,
        "expires_in_seconds": 300,
    }


@router.put("/students/{student_id}/readiness")
async def set_readiness(
    student_id: str,
    payload: ReadinessUpdate,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    if payload.readiness not in VALID_READINESS:
        raise HTTPException(status_code=400, detail="Invalid readiness label")
    profile = await scoped_profile(session, user, student_id)
    previous = profile.readiness_override
    profile.readiness_override = payload.readiness
    profile.coordinator_note = payload.note
    profile.updated_at = now_iso()
    await session.flush()
    await log_action(
        session,
        user,
        "readiness_change",
        "student",
        student_id,
        {"from": previous, "to": payload.readiness, "note": payload.note},
    )
    return {"student_id": student_id, "readiness": payload.readiness, "note": payload.note}


@router.post("/students/{student_id}/recommend")
async def recommend(
    student_id: str,
    payload: RecommendRequest,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    await scoped_profile(session, user, student_id)
    job = (
        await session.execute(
            select(Job).where(Job.id == payload.job_id, Job.institution_id == user.institution_id)
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found in your institution")
    rec = Recommendation(
        student_id=student_id, job_id=payload.job_id, coordinator_id=user.id, note=payload.note
    )
    session.add(rec)
    await session.flush()
    await log_action(session, user, "recommend_student", "student", student_id, {"job_id": payload.job_id})
    return {
        "id": rec.id,
        "student_id": rec.student_id,
        "job_id": rec.job_id,
        "coordinator_id": rec.coordinator_id,
        "note": rec.note,
        "created_at": rec.created_at,
    }


@router.get("/jobs")
async def list_jobs(user: User = Depends(coordinator_only), session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(Job).where(Job.institution_id == user.institution_id).order_by(Job.created_at.desc())
        )
    ).scalars().all()
    # One grouped count instead of a COUNT per job.
    counts = dict(
        (
            await session.execute(
                select(Application.job_id, func.count())
                .where(Application.job_id.in_([j.id for j in rows]))
                .group_by(Application.job_id)
            )
        ).all()
    ) if rows else {}

    items = []
    for job in rows:
        data = as_dict(job, JOB_FIELDS)
        data["applications"] = int(counts.get(job.id, 0))
        items.append(data)
    return items


@router.post("/jobs")
async def create_job(
    payload: JobInput,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    data = payload.model_dump()
    if not data.get("departments"):
        data["departments"] = [user.department]
    job = Job(institution_id=user.institution_id, created_by=user.id, **data)
    session.add(job)
    await session.flush()
    await log_action(session, user, "job_create", "job", job.id, {"title": job.title})
    return as_dict(job, JOB_FIELDS)


@router.put("/jobs/{job_id}")
async def update_job(
    job_id: str,
    payload: JobInput,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    job = (
        await session.execute(
            select(Job).where(Job.id == job_id, Job.institution_id == user.institution_id)
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found in your institution")
    for key, value in payload.model_dump().items():
        setattr(job, key, value)
    await session.flush()
    await log_action(session, user, "job_edit", "job", job_id, {"title": payload.title})
    return as_dict(job, JOB_FIELDS)


@router.get("/jobs/{job_id}/applications")
async def job_applications(
    job_id: str,
    user: User = Depends(coordinator_only),
    session: AsyncSession = Depends(get_session),
):
    job = (
        await session.execute(
            select(Job).where(Job.id == job_id, Job.institution_id == user.institution_id)
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found in your institution")
    rows = (
        await session.execute(
            select(Application).where(
                Application.job_id == job_id, Application.department == user.department
            )
        )
    ).scalars().all()
    ids = [a.student_id for a in rows]
    accounts = await users_by_id(session, ids)
    reports = await latest_reports_for(session, ids)
    items = []
    for app_row in rows:
        account = accounts.get(app_row.student_id)
        report = reports.get(app_row.student_id)
        items.append(
            {
                "application_id": app_row.id,
                "student_id": app_row.student_id,
                "name": account.name if account else None,
                "status": app_row.status,
                "applied_at": app_row.applied_at,
                "score": report.overall_score if report else None,
            }
        )
    return items
