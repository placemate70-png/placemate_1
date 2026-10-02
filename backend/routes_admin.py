from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import log_action, require_role
from database import get_session
from db_models import AuditLog, Institution, User
from models import ApprovalUpdate, DisableRequest, InstitutionInput, now_iso

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role("admin")

AUDIT_FIELDS = (
    "id", "actor_id", "actor_email", "actor_role", "action",
    "target_type", "target_id", "meta", "created_at",
)
INSTITUTION_FIELDS = ("id", "name", "code", "domains", "is_active", "created_at")


def as_dict(obj, fields) -> dict:
    return {f: getattr(obj, f) for f in fields}


async def count(session: AsyncSession, model, *where) -> int:
    stmt = select(func.count()).select_from(model)
    if where:
        stmt = stmt.where(*where)
    return int(await session.scalar(stmt) or 0)


@router.get("/stats")
async def stats(user: User = Depends(admin_only), session: AsyncSession = Depends(get_session)):
    from db_models import Job

    return {
        "institutions": await count(session, Institution),
        "students": await count(session, User, User.role == "student"),
        "coordinators": await count(session, User, User.role == "coordinator"),
        "unverified": await count(session, User, User.is_verified.is_(False), User.role != "admin"),
        "disabled": await count(session, User, User.is_disabled.is_(True)),
        "jobs": await count(session, Job),
        "audit_events": await count(session, AuditLog),
    }


@router.get("/institutions")
async def list_institutions(user: User = Depends(admin_only), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Institution).order_by(Institution.name))).scalars().all()
    items = []
    for institution in rows:
        data = as_dict(institution, INSTITUTION_FIELDS)
        data["coordinators"] = await count(
            session, User, User.role == "coordinator", User.institution_id == institution.id
        )
        data["students"] = await count(
            session, User, User.role == "student", User.institution_id == institution.id
        )
        items.append(data)
    return items


@router.post("/institutions")
async def create_institution(
    payload: InstitutionInput,
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    exists = (
        await session.execute(select(Institution).where(Institution.name == payload.name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="An institution with this name already exists")
    institution = Institution(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        domains=[d.strip().lower().lstrip("@") for d in payload.domains if d.strip()],
        is_active=payload.is_active,
    )
    session.add(institution)
    await session.flush()
    await log_action(session, user, "institution_create", "institution", institution.id, {"name": institution.name})
    return as_dict(institution, INSTITUTION_FIELDS)


@router.put("/institutions/{institution_id}")
async def update_institution(
    institution_id: str,
    payload: InstitutionInput,
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    institution = await session.get(Institution, institution_id)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    updates = {
        "name": payload.name.strip(),
        "code": payload.code.strip().upper(),
        "domains": [d.strip().lower().lstrip("@") for d in payload.domains if d.strip()],
        "is_active": payload.is_active,
    }
    for key, value in updates.items():
        setattr(institution, key, value)
    await session.flush()
    await log_action(session, user, "institution_update", "institution", institution_id, updates)
    return as_dict(institution, INSTITUTION_FIELDS)


@router.get("/users")
async def list_users(
    role: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(User).order_by(User.created_at.desc())
    if role and role != "ALL":
        stmt = stmt.where(User.role == role)
    rows = (await session.execute(stmt)).scalars().all()
    institutions = {
        i.id: i.name for i in (await session.execute(select(Institution))).scalars().all()
    }
    items = []
    for account in rows:
        if search and search.lower() not in f"{account.name} {account.email}".lower():
            continue
        items.append(
            {
                "id": account.id,
                "name": account.name,
                "email": account.email,
                "role": account.role,
                "department": account.department,
                "institution_name": institutions.get(account.institution_id),
                "is_verified": account.is_verified,
                "is_disabled": account.is_disabled,
                "approval_status": account.approval_status,
                "created_at": account.created_at,
            }
        )
    return items


@router.put("/users/{user_id}/disable")
async def set_disabled(
    user_id: str,
    payload: DisableRequest,
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    target = await session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "admin":
        raise HTTPException(status_code=400, detail="Administrator accounts cannot be disabled")
    target.is_disabled = payload.is_disabled
    await session.flush()
    await log_action(
        session,
        user,
        "account_disable" if payload.is_disabled else "account_enable",
        "user",
        user_id,
        {"email": target.email, "role": target.role},
    )
    return {"id": user_id, "is_disabled": payload.is_disabled}


@router.put("/users/{user_id}/verify")
async def force_verify(
    user_id: str,
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    target = await session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_verified = True
    await session.flush()
    await log_action(session, user, "manual_verify", "user", user_id, {"email": target.email})
    return {"id": user_id, "is_verified": True}


@router.put("/users/{user_id}/approval")
async def set_approval(
    user_id: str,
    payload: ApprovalUpdate,
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    """Admin override for coordinator approval.

    Needed so a student whose department has no verified coordinator yet is not
    stranded in "pending" forever.
    """
    if payload.status not in {"pending", "approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid approval status")
    target = await session.get(User, user_id)
    if not target or target.role != "student":
        raise HTTPException(status_code=404, detail="Student not found")

    previous = target.approval_status
    target.approval_status = payload.status
    target.approved_by = user.id
    target.approved_at = now_iso()
    target.rejection_reason = payload.reason if payload.status == "rejected" else None
    await session.flush()
    await log_action(
        session, user, f"student_{payload.status}", "user", user_id,
        {"email": target.email, "from": previous, "to": payload.status, "by": "admin"},
    )
    return {"id": user_id, "approval_status": target.approval_status}


@router.get("/audit-logs")
async def audit_logs(
    action: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    user: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action and action != "ALL":
        stmt = stmt.where(AuditLog.action == action)
    rows = (await session.execute(stmt)).scalars().all()
    return [as_dict(row, AUDIT_FIELDS) for row in rows]
