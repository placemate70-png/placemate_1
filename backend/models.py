import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BaseDocument(BaseModel):
    """Maps Mongo `_id` <-> `id`. Never spread raw Mongo dicts into responses."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    def to_mongo(self) -> dict:
        data = self.model_dump()
        data["_id"] = data.pop("id")
        return data

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        if not doc:
            return None
        data = dict(doc)
        if "_id" in data:
            data["id"] = str(data.pop("_id"))
        return cls(**data)


# ---------- Documents ----------
class Institution(BaseDocument):
    name: str
    code: str
    domains: List[str] = []
    is_active: bool = True
    created_at: str = Field(default_factory=now_iso)


class User(BaseDocument):
    email: str
    password_hash: str
    name: str
    role: str  # student | coordinator | admin
    phone: Optional[str] = None
    institution_id: Optional[str] = None
    department: Optional[str] = None
    is_verified: bool = False
    is_disabled: bool = False
    consent_accepted: bool = False
    created_at: str = Field(default_factory=now_iso)


class StudentProfile(BaseDocument):
    user_id: str
    institution_id: str
    department: str
    roll_number: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[int] = None
    cgpa: Optional[float] = None
    target_role: Optional[str] = None
    headline: Optional[str] = None
    skills: List[str] = []
    projects_count: int = 0
    internships_count: int = 0
    resume_file_id: Optional[str] = None
    resume_filename: Optional[str] = None
    share_consent: bool = False
    readiness_override: Optional[str] = None
    coordinator_note: Optional[str] = None
    updated_at: str = Field(default_factory=now_iso)


class AssessmentAttempt(BaseDocument):
    user_id: str
    assessment_id: str
    correct: int
    total: int
    skill_scores: Dict[str, float] = {}
    submitted_at: str = Field(default_factory=now_iso)


class SkillGapReport(BaseDocument):
    user_id: str
    target_role: str
    overall_score: int
    readiness: str
    gaps: List[Dict[str, Any]] = []
    strengths: List[str] = []
    recommendations: List[str] = []
    summary: str = ""
    provider: str = "deterministic"
    created_at: str = Field(default_factory=now_iso)


class Job(BaseDocument):
    institution_id: str
    created_by: str
    title: str
    company: str
    description: str
    location: str
    ctc: str
    departments: List[str] = []
    required_skills: List[str] = []
    min_cgpa: float = 0
    deadline: Optional[str] = None
    is_open: bool = True
    created_at: str = Field(default_factory=now_iso)


class Application(BaseDocument):
    job_id: str
    student_id: str
    institution_id: str
    department: str
    status: str = "applied"
    applied_at: str = Field(default_factory=now_iso)


class Recommendation(BaseDocument):
    student_id: str
    job_id: str
    coordinator_id: str
    note: str = ""
    created_at: str = Field(default_factory=now_iso)


class AuditLog(BaseDocument):
    actor_id: str
    actor_email: str
    actor_role: str
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    meta: Dict[str, Any] = {}
    created_at: str = Field(default_factory=now_iso)


# ---------- Requests ----------
class StudentRegister(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    phone: str
    institution_id: str
    department: str
    password: str = Field(min_length=8)
    confirm_password: str
    consent_accepted: bool


class CoordinatorRegister(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    phone: str
    institution_id: str
    department: str
    password: str = Field(min_length=8)
    confirm_password: str
    consent_accepted: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: str


class TokenRequest(BaseModel):
    token: str


class EmailRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ProfileUpdate(BaseModel):
    roll_number: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[int] = None
    cgpa: Optional[float] = None
    target_role: Optional[str] = None
    headline: Optional[str] = None
    skills: Optional[List[str]] = None
    projects_count: Optional[int] = None
    internships_count: Optional[int] = None
    share_consent: Optional[bool] = None


class AssessmentSubmit(BaseModel):
    answers: Dict[str, int]


class AnalyzeRequest(BaseModel):
    target_role: Optional[str] = None


class ApprovalUpdate(BaseModel):
    status: str  # pending | approved | rejected
    reason: Optional[str] = None


class ProgressUpdate(BaseModel):
    status: str  # pending | in_progress | completed


class ReadinessUpdate(BaseModel):
    readiness: str
    note: Optional[str] = None


class RecommendRequest(BaseModel):
    job_id: str
    note: str = ""


class JobInput(BaseModel):
    title: str
    company: str
    description: str
    location: str
    ctc: str
    departments: List[str] = []
    required_skills: List[str] = []
    min_cgpa: float = 0
    deadline: Optional[str] = None
    is_open: bool = True


class InstitutionInput(BaseModel):
    name: str
    code: str
    domains: List[str] = []
    is_active: bool = True


class DisableRequest(BaseModel):
    is_disabled: bool
