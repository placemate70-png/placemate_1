"""SQLAlchemy ORM models — the persistence layer that replaced MongoDB.

Portability notes (deliberate, so the same models run on SQLite and Postgres):
- Primary keys stay `String(36)` UUIDs rather than integers, so every id already
  handed to the frontend and to the test suite keeps working unchanged.
- Timestamps stay ISO-8601 strings produced by `models.now_iso()`, so API
  responses are byte-identical to the Mongo implementation.
- Lists/dicts use the generic `JSON` type (not Postgres `JSONB`/`ARRAY`) so the
  local SQLite test database and Supabase/Postgres share one schema definition.
"""

import uuid

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from models import now_iso


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    domains: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # student | coordinator | admin
    phone: Mapped[str | None] = mapped_column(String(40))
    institution_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("institutions.id"))
    department: Mapped[str | None] = mapped_column(String(120))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)

    # Coordinator approval gate. Defaults to "approved" so that any account
    # created outside student registration (coordinators, admins, seeds, and every
    # pre-existing row) is unaffected; student signup sets "pending" explicitly.
    approval_status: Mapped[str] = mapped_column(String(16), default="approved")  # pending|approved|rejected
    approved_by: Mapped[str | None] = mapped_column(String(36))
    approved_at: Mapped[str | None] = mapped_column(String(40))
    rejection_reason: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("ix_users_scope", "role", "institution_id", "department"),)


class StudentProfile(Base):
    __tablename__ = "students"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    institution_id: Mapped[str] = mapped_column(String(36), ForeignKey("institutions.id"), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    college: Mapped[str | None] = mapped_column(String(255))  # brief schema: students.college
    roll_number: Mapped[str | None] = mapped_column(String(64))
    degree: Mapped[str | None] = mapped_column(String(64))
    graduation_year: Mapped[int | None] = mapped_column(Integer)
    cgpa: Mapped[float | None] = mapped_column(Float)
    target_role: Mapped[str | None] = mapped_column(String(120))
    headline: Mapped[str | None] = mapped_column(String(255))
    skills: Mapped[list] = mapped_column(JSON, default=list)
    projects_count: Mapped[int] = mapped_column(Integer, default=0)
    internships_count: Mapped[int] = mapped_column(Integer, default=0)
    resume_file_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("files.id"))
    resume_filename: Mapped[str | None] = mapped_column(String(255))
    # Retained for historical rows; consent no longer gates coordinator access.
    share_consent: Mapped[bool] = mapped_column(Boolean, default=True)
    readiness_override: Mapped[str | None] = mapped_column(String(32))
    coordinator_note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(String(40), default=now_iso)

    # Roll number is write-once and unique per institution. NULLs are permitted
    # (and repeatable) so students who have not entered one yet are unaffected.
    __table_args__ = (
        UniqueConstraint("institution_id", "roll_number", name="uq_student_institution_roll"),
    )


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    assessment_id: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), default="aptitude")  # aptitude | coding
    correct: Mapped[int] = mapped_column(Integer, nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    skill_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    submitted_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class SkillGapReport(Base):
    __tablename__ = "skill_gap_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    target_role: Mapped[str] = mapped_column(String(120), nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)
    readiness: Mapped[str] = mapped_column(String(32), nullable=False)
    gaps: Mapped[list] = mapped_column(JSON, default=list)
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    recommendations: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(64), default="deterministic")
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso, index=True)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    institution_id: Mapped[str] = mapped_column(String(36), ForeignKey("institutions.id"), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    ctc: Mapped[str] = mapped_column(String(64), default="")
    departments: Mapped[list] = mapped_column(JSON, default=list)
    required_skills: Mapped[list] = mapped_column(JSON, default=list)
    min_cgpa: Mapped[float] = mapped_column(Float, default=0)
    deadline: Mapped[str | None] = mapped_column(String(40))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("jobs.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    institution_id: Mapped[str] = mapped_column(String(36), ForeignKey("institutions.id"), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="applied")
    applied_at: Mapped[str] = mapped_column(String(40), default=now_iso)

    # Mirrors the unique Mongo index that stopped duplicate applications.
    __table_args__ = (UniqueConstraint("job_id", "student_id", name="uq_application_job_student"),)


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("jobs.id"), nullable=False)
    coordinator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_email: Mapped[str] = mapped_column(String(320), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(36))
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso, index=True)


class EmailToken(Base):
    """The token itself is the primary key, matching the old `_id = token`."""

    __tablename__ = "email_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # verify | reset
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    used_at: Mapped[str | None] = mapped_column(String(40))


class LoginAttempt(Base):
    """Rate-limit counter keyed by the `ip:email` identifier (was the Mongo `_id`)."""

    __tablename__ = "login_attempts"

    identifier: Mapped[str] = mapped_column(String(400), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[str | None] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class ProgressLog(Base):
    """Per-skill preparation progress (brief schema: progress_logs)."""

    __tablename__ = "progress_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    skill: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|in_progress|completed
    updated_at: Mapped[str] = mapped_column(String(40), default=now_iso)

    __table_args__ = (UniqueConstraint("student_id", "skill", name="uq_progress_student_skill"),)


class SkillGap(Base):
    """Flattened per-skill gap rows (brief schema: skill_gaps).

    The authoritative computation still lives in SkillGapReport.gaps; these rows
    exist so coordinator batch analytics can aggregate across students in SQL
    instead of unpacking every student's JSON report.
    """

    __tablename__ = "skill_gaps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    skill: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    gap_level: Mapped[int] = mapped_column(Integer, default=0)  # 0-100
    recommendation: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[str] = mapped_column(String(40), default=now_iso)

    __table_args__ = (UniqueConstraint("student_id", "skill", name="uq_skillgap_student_skill"),)


class Roadmap(Base):
    """Personalized preparation roadmap generated per student + target role."""

    __tablename__ = "roadmaps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    target_role: Mapped[str] = mapped_column(String(120), nullable=False)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(64), default="deterministic")
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso, index=True)


class FileRecord(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(128), default="application/pdf")
    size: Mapped[int] = mapped_column(Integer, default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
