import logging
import os
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_service import compute_gaps, compute_overall, fallback_narrative, readiness_from_score
from auth import hash_password
from db_models import (
    Application,
    AssessmentAttempt,
    Institution,
    Job,
    SkillGapReport,
    StudentProfile,
    User,
)
from models import now_iso

logger = logging.getLogger(__name__)

INSTITUTIONS = [
    {"name": "Northgate Institute of Technology", "code": "NIT", "domains": ["nit.edu"]},
    {"name": "Sunrise University", "code": "SRU", "domains": ["sru.edu"]},
    {"name": "Meridian College of Engineering", "code": "MCE", "domains": ["mce.edu"]},
]

DEMO_STUDENTS = [
    {
        "name": "Aarav Menon", "email": "aarav.menon@nit.edu", "department": "Computer Science",
        "roll": "NIT21CS004", "cgpa": 8.9, "role": "Software Engineer (Backend)", "strength": 0.92,
        "projects": 4, "internships": 1, "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
    },
    {
        "name": "Ishita Rao", "email": "ishita.rao@nit.edu", "department": "Computer Science",
        "roll": "NIT21CS011", "cgpa": 8.2, "role": "Full Stack Developer", "strength": 0.78,
        "projects": 3, "internships": 1, "skills": ["React", "Node.js", "MongoDB"],
    },
    {
        "name": "Kabir Nair", "email": "kabir.nair@nit.edu", "department": "Computer Science",
        "roll": "NIT21CS023", "cgpa": 7.4, "role": "Data Analyst", "strength": 0.6,
        "projects": 2, "internships": 0, "skills": ["SQL", "Excel", "Pandas"],
    },
    {
        "name": "Meera Iyer", "email": "meera.iyer@nit.edu", "department": "Computer Science",
        "roll": "NIT21CS031", "cgpa": 6.8, "role": "ML Engineer", "strength": 0.42,
        "projects": 1, "internships": 0, "skills": ["Python", "NumPy"],
    },
    {
        "name": "Rohan Desai", "email": "rohan.desai@nit.edu", "department": "Computer Science",
        "roll": "NIT21CS042", "cgpa": 7.9, "role": "Cloud / DevOps Engineer", "strength": 0.7,
        "projects": 2, "internships": 1, "skills": ["Linux", "AWS", "Terraform"],
    },
    {
        "name": "Tara Bhat", "email": "tara.bhat@nit.edu", "department": "Electronics",
        "roll": "NIT21EC008", "cgpa": 8.4, "role": "Software Engineer (Backend)", "strength": 0.75,
        "projects": 3, "internships": 0, "skills": ["C++", "Embedded C"],
    },
]

SKILL_POOL = [
    "Programming Fundamentals", "Data Structures", "Algorithms", "Databases", "Operating Systems",
    "Computer Networks", "Aptitude", "Communication", "Statistics", "Machine Learning",
    "Web Development", "Cloud & DevOps",
]


async def _find_user(session: AsyncSession, email: str) -> User | None:
    return (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def seed_admin(session: AsyncSession) -> None:
    email = os.environ["ADMIN_EMAIL"].lower()
    password = os.environ["ADMIN_PASSWORD"]
    if await _find_user(session, email):
        return
    session.add(
        User(
            email=email, password_hash=hash_password(password), name="Platform Admin", role="admin",
            is_verified=True, consent_accepted=True,
        )
    )
    await session.flush()


async def seed_demo(session: AsyncSession) -> None:
    for spec in INSTITUTIONS:
        exists = (
            await session.execute(select(Institution).where(Institution.name == spec["name"]))
        ).scalar_one_or_none()
        if not exists:
            session.add(Institution(**spec))
    await session.flush()

    nit = (await session.execute(select(Institution).where(Institution.code == "NIT"))).scalar_one()
    if await _find_user(session, "priya.sharma@nit.edu"):
        return

    coordinator = User(
        email="priya.sharma@nit.edu", password_hash=hash_password("Coord@12345"), name="Dr. Priya Sharma",
        role="coordinator", phone="+91 98200 11223", institution_id=nit.id, department="Computer Science",
        is_verified=True, consent_accepted=True,
    )
    session.add(coordinator)
    await session.flush()

    jobs = [
        Job(
            institution_id=nit.id, created_by=coordinator.id, title="Backend Engineer - Graduate Programme",
            company="Northwind Systems",
            description="Build and scale distributed payment services in Python and Go. 12-week structured onboarding.",
            location="Bengaluru", ctc="INR 14.5 LPA", departments=["Computer Science"],
            required_skills=["Data Structures", "Algorithms", "Databases"], min_cgpa=7.0, deadline="2026-08-15",
        ),
        Job(
            institution_id=nit.id, created_by=coordinator.id, title="Full Stack Developer Intern",
            company="Lumen Labs",
            description="Ship product features across React and FastAPI with a senior mentor pairing weekly.",
            location="Remote (India)", ctc="INR 60,000 / month", departments=["Computer Science", "Electronics"],
            required_skills=["Web Development", "Databases"], min_cgpa=6.5, deadline="2026-07-30",
        ),
        Job(
            institution_id=nit.id, created_by=coordinator.id, title="Data Analyst - Campus Hire",
            company="Vertex Analytics",
            description="Own reporting pipelines and executive dashboards for retail clients.",
            location="Pune", ctc="INR 9 LPA", departments=["Computer Science"],
            required_skills=["Statistics", "Databases", "Communication"], min_cgpa=7.0, deadline="2026-09-01",
        ),
    ]
    session.add_all(jobs)
    await session.flush()

    random.seed(7)
    for spec in DEMO_STUDENTS:
        student = User(
            email=spec["email"], password_hash=hash_password("Student@12345"), name=spec["name"], role="student",
            phone="+91 90000 00000", institution_id=nit.id, department=spec["department"], is_verified=True,
            consent_accepted=True,
        )
        session.add(student)
        await session.flush()

        profile = StudentProfile(
            user_id=student.id, institution_id=nit.id, department=spec["department"], roll_number=spec["roll"],
            degree="B.Tech", graduation_year=2026, cgpa=spec["cgpa"], target_role=spec["role"],
            headline=f"Final-year {spec['department']} student targeting {spec['role']} roles",
            skills=spec["skills"], projects_count=spec["projects"], internships_count=spec["internships"],
            share_consent=True,
        )
        session.add(profile)

        levels = {}
        for skill in SKILL_POOL:
            base = spec["strength"] * 5
            levels[skill] = round(min(5, max(0, base + random.uniform(-1.2, 1.0))), 2)
        for assessment_id, skills in [
            ("core-cs", SKILL_POOL[:6]),
            ("aptitude-comm", SKILL_POOL[6:8]),
            ("data-ml", SKILL_POOL[8:10]),
            ("web-cloud", SKILL_POOL[10:]),
        ]:
            scores = {s: levels[s] for s in skills}
            correct = int(round(sum(scores.values()) / (5 * len(skills)) * len(skills) * 2))
            session.add(
                AssessmentAttempt(
                    user_id=student.id, assessment_id=assessment_id, correct=correct,
                    total=len(skills) * 2, skill_scores=scores,
                )
            )

        computed = compute_gaps(spec["role"], levels)
        profile_dict = {
            "roll_number": profile.roll_number, "degree": profile.degree,
            "graduation_year": profile.graduation_year, "cgpa": profile.cgpa,
            "target_role": profile.target_role, "headline": profile.headline, "skills": profile.skills,
            "projects_count": profile.projects_count, "internships_count": profile.internships_count,
            "resume_file_id": profile.resume_file_id,
        }
        score = compute_overall(computed["skill_match"], profile_dict, 4)
        narrative = fallback_narrative(spec["role"], computed["gaps"], score)
        session.add(
            SkillGapReport(
                user_id=student.id, target_role=spec["role"], overall_score=score,
                readiness=readiness_from_score(score), gaps=computed["gaps"], strengths=computed["strengths"],
                recommendations=narrative["recommendations"], summary=narrative["summary"],
                provider=narrative["provider"],
            )
        )

        if spec["cgpa"] >= 7.0:
            session.add(
                Application(
                    job_id=jobs[0].id, student_id=student.id, institution_id=nit.id, department=spec["department"]
                )
            )

    await session.flush()
    logger.info("Demo data seeded at %s", now_iso())
