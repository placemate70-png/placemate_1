import logging
import os

logger = logging.getLogger(__name__)

EMAIL_MODE = os.environ.get("EMAIL_MODE", "mock")


def is_mock() -> bool:
    return EMAIL_MODE == "mock"


def send_email(to: str, subject: str, body: str) -> None:
    """MOCKED transport: logs the message. Swap for Resend/SendGrid when keys are supplied."""
    logger.info("[EMAIL:%s] to=%s subject=%s\n%s", EMAIL_MODE, to, subject, body)


def send_verification(to: str, name: str, token: str) -> None:
    send_email(
        to,
        "Verify your PlaceMate account",
        f"Hi {name},\n\nVerify your account: /verify-email?token={token}\nThis link expires in 24 hours.",
    )


def send_reset(to: str, token: str) -> None:
    send_email(
        to,
        "Reset your PlaceMate password",
        f"Reset your password: /reset-password?token={token}\nThis link expires in 60 minutes and can be used once.",
    )
