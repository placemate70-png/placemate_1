import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_session
from db_models import AuditLog, EmailToken, LoginAttempt, User
from models import now_iso

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MINUTES = 720
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def client_ip(request: Request) -> str:
    """Behind the k8s ingress request.client.host is the ingress pod, so trust the first hop."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_file_token(file_id: str, minutes: int = 5) -> str:
    payload = {
        "file_id": file_id,
        "type": "file",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Link or session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


PUBLIC_USER_FIELDS = (
    "id", "email", "name", "role", "phone", "institution_id",
    "department", "is_verified", "is_disabled", "consent_accepted", "created_at",
    "approval_status",
)


def public_user(user: User) -> dict:
    """Same field set the Pydantic model exposed — never includes password_hash."""
    return {field: getattr(user, field) for field in PUBLIC_USER_FIELDS}


async def get_current_user(
    request: Request, session: AsyncSession = Depends(get_session)
) -> User:
    token = request.cookies.get("access_token")
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    # Re-read every request so disabled/unverified accounts lose access immediately.
    user = await session.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.is_disabled:
        raise HTTPException(status_code=403, detail="This account has been disabled by an administrator")
    if user.role != "admin" and not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email address to continue")
    # Re-checked per request, so revoking approval ends a live session immediately,
    # exactly like disabling an account does.
    if user.role == "student" and user.approval_status != "approved":
        raise HTTPException(
            status_code=403,
            detail=(
                "Your registration was rejected by your placement coordinator"
                if user.approval_status == "rejected"
                else "Your account is pending approval from your placement coordinator"
            ),
        )
    return user


def require_role(*roles: str):
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have access to this resource")
        return user

    return dependency


# ---------- Rate limiting / lockout ----------
# These deliberately use their own session rather than the request's. A failed
# login raises HTTPException, which rolls the request transaction back — if the
# counter lived in that transaction the increment would be undone and lockout
# could never trigger.
async def check_lock(identifier: str, max_attempts: int = MAX_FAILED_ATTEMPTS) -> None:
    async with AsyncSessionLocal() as session:
        record = await session.get(LoginAttempt, identifier)
        if not record:
            return
        locked_until = record.locked_until
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            remaining = int(
                (datetime.fromisoformat(locked_until) - datetime.now(timezone.utc)).total_seconds() // 60
            ) + 1
            raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {remaining} minute(s).")
        if (record.count or 0) >= max_attempts:
            await session.delete(record)
            await session.commit()


async def register_failure(identifier: str, max_attempts: int = MAX_FAILED_ATTEMPTS) -> None:
    async with AsyncSessionLocal() as session:
        record = await session.get(LoginAttempt, identifier)
        if record is None:
            record = LoginAttempt(identifier=identifier, count=0)
            session.add(record)
        record.count = (record.count or 0) + 1
        record.updated_at = now_iso()
        if record.count >= max_attempts:
            record.locked_until = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        await session.commit()


async def clear_failures(identifier: str) -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(delete(LoginAttempt).where(LoginAttempt.identifier == identifier))
        await session.commit()


# ---------- Email tokens ----------
async def issue_email_token(session: AsyncSession, user_id: str, kind: str, ttl_minutes: int = 60) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        EmailToken(
            token=token,
            user_id=user_id,
            kind=kind,
            used=False,
            expires_at=(datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)).isoformat(),
        )
    )
    await session.flush()
    return token


async def consume_email_token(session: AsyncSession, token: str, kind: str) -> Optional[str]:
    record = (
        await session.execute(select(EmailToken).where(EmailToken.token == token, EmailToken.kind == kind))
    ).scalar_one_or_none()
    if not record or record.used:
        return None
    if datetime.fromisoformat(record.expires_at) < datetime.now(timezone.utc):
        return None
    record.used = True
    record.used_at = now_iso()
    await session.flush()
    return record.user_id


async def log_action(
    session: AsyncSession,
    actor: User,
    action: str,
    target_type: str = None,
    target_id: str = None,
    meta: dict = None,
):
    session.add(
        AuditLog(
            actor_id=actor.id,
            actor_email=actor.email,
            actor_role=actor.role,
            action=action,
            target_type=target_type,
            target_id=target_id,
            meta=meta or {},
        )
    )
    await session.flush()
