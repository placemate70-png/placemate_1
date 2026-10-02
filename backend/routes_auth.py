from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    check_lock,
    client_ip,
    clear_failures,
    consume_email_token,
    create_access_token,
    get_current_user,
    hash_password,
    issue_email_token,
    log_action,
    public_user,
    register_failure,
    verify_password,
)
from database import get_session
from db_models import Institution, LoginAttempt, StudentProfile, User
from mailer import is_mock, send_reset, send_verification
from models import (
    CoordinatorRegister,
    EmailRequest,
    LoginRequest,
    ResetPasswordRequest,
    StudentRegister,
    TokenRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
GENERIC_RESET_MSG = "If an account exists for that email, a password reset link has been sent."


def set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=True, samesite="none", max_age=43200, path="/"
    )


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    return (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def validate_institution(session: AsyncSession, institution_id: str, email: str) -> Institution:
    institution = (
        await session.execute(
            select(Institution).where(Institution.id == institution_id, Institution.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if not institution:
        raise HTTPException(status_code=400, detail="Select a valid approved institution")
    domain = email.split("@")[-1].lower()
    if domain not in [d.lower() for d in institution.domains]:
        raise HTTPException(
            status_code=400,
            detail=f"Email domain '{domain}' is not a verified domain for {institution.name}. Allowed: {', '.join(institution.domains)}",
        )
    return institution


async def create_account(session: AsyncSession, payload, role: str) -> dict:
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if not payload.consent_accepted:
        raise HTTPException(status_code=400, detail="You must accept the terms and privacy notice")
    email = payload.email.lower().strip()
    if await get_user_by_email(session, email):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    institution = await validate_institution(session, payload.institution_id, email)
    if not payload.department.strip():
        raise HTTPException(status_code=400, detail="Department is required")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name.strip(),
        role=role,
        phone=payload.phone.strip(),
        institution_id=institution.id,
        department=payload.department.strip(),
        consent_accepted=True,
        # Students must be approved by a coordinator of their own institution +
        # department. Coordinators are already gated by verified email domain.
        approval_status="pending" if role == "student" else "approved",
    )
    session.add(user)
    await session.flush()
    if role == "student":
        session.add(
            StudentProfile(user_id=user.id, institution_id=institution.id, department=user.department)
        )
        await session.flush()

    token = await issue_email_token(session, user.id, "verify", ttl_minutes=60 * 24)
    send_verification(email, user.name, token)
    result = {
        "message": (
            "Account created. Verify your email, then your placement coordinator must approve access."
            if role == "student"
            else "Account created. Verify your email to activate your account."
        ),
        "email": email,
        "requires_verification": True,
        "requires_coordinator_approval": role == "student",
    }
    if is_mock():
        result["verification_token"] = token
        result["mock_email"] = True
    return result


@router.get("/institutions")
async def list_institutions(session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(Institution).where(Institution.is_active.is_(True)).order_by(Institution.name)
        )
    ).scalars()
    return [{"id": i.id, "name": i.name, "code": i.code, "domains": i.domains} for i in rows]


@router.post("/register/student")
async def register_student(payload: StudentRegister, session: AsyncSession = Depends(get_session)):
    return await create_account(session, payload, "student")


@router.post("/register/coordinator")
async def register_coordinator(payload: CoordinatorRegister, session: AsyncSession = Depends(get_session)):
    return await create_account(session, payload, "coordinator")


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    email = payload.email.lower().strip()
    if payload.role not in ("student", "coordinator", "admin"):
        raise HTTPException(status_code=400, detail="Invalid login portal")
    identifier = f"{client_ip(request)}:{email}"
    await check_lock(identifier)

    user = await get_user_by_email(session, email)
    if not user or not verify_password(payload.password, user.password_hash) or user.role != payload.role:
        await register_failure(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password for this portal")
    if user.is_disabled:
        raise HTTPException(status_code=403, detail="This account has been disabled by an administrator")
    if user.role != "admin" and not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified. Check your inbox for the verification link.")
    if user.role == "student" and user.approval_status != "approved":
        if user.approval_status == "rejected":
            reason = f" Reason: {user.rejection_reason}" if user.rejection_reason else ""
            raise HTTPException(
                status_code=403,
                detail=f"Your registration was rejected by your placement coordinator.{reason}",
            )
        raise HTTPException(
            status_code=403,
            detail="Your account is waiting for approval from your placement coordinator. "
                   "You will be able to sign in once they approve it.",
        )

    await clear_failures(identifier)
    token = create_access_token(user.id, user.email, user.role)
    set_cookie(response, token)
    await log_action(session, user, "login")
    return {"access_token": token, "user": public_user(user)}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    data = public_user(user)
    if user.institution_id:
        institution = await session.get(Institution, user.institution_id)
        data["institution_name"] = institution.name if institution else None
    return data


@router.post("/verify-email")
async def verify_email(payload: TokenRequest, session: AsyncSession = Depends(get_session)):
    user_id = await consume_email_token(session, payload.token, "verify")
    if not user_id:
        raise HTTPException(status_code=400, detail="This verification link is invalid, expired or already used")
    user = await session.get(User, user_id)
    user.is_verified = True
    await session.flush()
    return {"message": "Email verified. You can now sign in.", "role": user.role}


@router.post("/resend-verification")
async def resend_verification(
    payload: EmailRequest, request: Request, session: AsyncSession = Depends(get_session)
):
    email = payload.email.lower().strip()
    ip = client_ip(request)
    await check_lock(f"resend:{ip}:{email}", max_attempts=5)
    await register_failure(f"resend:{ip}:{email}", max_attempts=5)
    user = await get_user_by_email(session, email)
    result = {"message": "If the account exists and is unverified, a new link has been sent."}
    if user and not user.is_verified:
        token = await issue_email_token(session, user.id, "verify", ttl_minutes=60 * 24)
        send_verification(email, user.name, token)
        if is_mock():
            result["verification_token"] = token
    return result


@router.post("/forgot-password")
async def forgot_password(
    payload: EmailRequest, request: Request, session: AsyncSession = Depends(get_session)
):
    email = payload.email.lower().strip()
    identifier = f"reset:{client_ip(request)}:{email}"
    await check_lock(identifier, max_attempts=4)
    await register_failure(identifier, max_attempts=4)

    user = await get_user_by_email(session, email)
    result = {"message": GENERIC_RESET_MSG}
    if user and not user.is_disabled:
        token = await issue_email_token(session, user.id, "reset", ttl_minutes=60)
        send_reset(email, token)
        if is_mock():
            result["reset_token"] = token
    return result


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, session: AsyncSession = Depends(get_session)):
    user_id = await consume_email_token(session, payload.token, "reset")
    if not user_id:
        raise HTTPException(status_code=400, detail="This reset link is invalid, expired or already used")
    account = await session.get(User, user_id)
    account.password_hash = hash_password(payload.new_password)
    # Clear lockouts for this account only — never every account sharing the IP.
    await session.execute(
        delete(LoginAttempt).where(LoginAttempt.identifier.endswith(f":{account.email}", autoescape=True))
    )
    await session.flush()
    return {"message": "Password updated. You can now sign in."}
