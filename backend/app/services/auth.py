"""Passwordless email OTP authentication and refresh-token sessions."""

import logging
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import TooManyRequests, Unauthorized
from app.core.security import (
    constant_time_equals,
    create_access_token,
    generate_otp,
    hash_otp,
    hash_token,
    new_refresh_token,
    utcnow,
)
from app.models import AuthSession, OtpCode, User, Wallet
from app.models.enums import Audience, OtpPurpose, UserRole
from app.services.email import enqueue_email

logger = logging.getLogger("spuni.auth")


@dataclass
class OtpIssued:
    resend_after_seconds: int
    expires_in_seconds: int


@dataclass
class LoginResult:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str
    is_new_user: bool


def _audience_for(purpose: OtpPurpose) -> Audience:
    return Audience.ADMIN if purpose == OtpPurpose.ADMIN_LOGIN else Audience.CUSTOMER


async def _latest_code(db: AsyncSession, email: str, purpose: OtpPurpose) -> OtpCode | None:
    return (
        await db.execute(
            select(OtpCode)
            .where(OtpCode.email == email, OtpCode.purpose == purpose)
            .order_by(OtpCode.created_at.desc(), OtpCode.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def request_otp(
    db: AsyncSession, *, email: str, purpose: OtpPurpose, ip: str | None, resend: bool = False
) -> OtpIssued:
    """Issue a new code. Responses never reveal whether an account exists."""
    email = email.lower()
    now = utcnow()
    issued = OtpIssued(settings.otp_resend_cooldown_seconds, settings.otp_ttl_minutes * 60)

    latest = await _latest_code(db, email, purpose)
    if latest is not None:
        elapsed = (now - latest.created_at).total_seconds()
        if elapsed < settings.otp_resend_cooldown_seconds:
            wait = int(settings.otp_resend_cooldown_seconds - elapsed) + 1
            raise TooManyRequests(
                f"Please wait {wait} seconds before requesting another code.",
                code="otp_cooldown",
                details={"retry_after": wait},
            )

    recent = await db.scalar(
        select(func.count(OtpCode.id)).where(
            OtpCode.email == email,
            OtpCode.purpose == purpose,
            OtpCode.created_at > now - timedelta(hours=1),
        )
    )
    if (recent or 0) >= settings.otp_max_requests_per_hour:
        raise TooManyRequests(
            "Too many codes requested for this email. Please try again in an hour.",
            code="otp_hourly_limit",
            details={"retry_after": 3600},
        )

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    allowed = True
    if user is not None and not user.is_active:
        allowed = False
    if purpose == OtpPurpose.ADMIN_LOGIN and (user is None or user.role != UserRole.ADMIN):
        allowed = False

    # Invalidate earlier live codes: only the newest code works ("forgot OTP" flow).
    await db.execute(
        update(OtpCode)
        .where(
            OtpCode.email == email,
            OtpCode.purpose == purpose,
            OtpCode.consumed_at.is_(None),
            OtpCode.invalidated_at.is_(None),
        )
        .values(invalidated_at=now)
    )

    code = generate_otp()
    # A row is written even when not allowed so cooldowns/limits behave identically
    # (no timing or behaviour difference reveals which emails are registered).
    db.add(
        OtpCode(
            email=email,
            purpose=purpose,
            code_hash=hash_otp(email, purpose, code) if allowed else "0" * 64,
            expires_at=now + timedelta(minutes=settings.otp_ttl_minutes),
            invalidated_at=None if allowed else now,
            request_ip=ip,
        )
    )

    if allowed:
        is_admin = purpose == OtpPurpose.ADMIN_LOGIN
        await enqueue_email(
            db,
            to=email,
            subject=(
                f"Your new SPUNI {'admin ' if is_admin else ''}sign-in code"
                if resend
                else f"Your SPUNI {'admin ' if is_admin else ''}sign-in code"
            ),
            template="otp",
            context={
                "code": code,
                "name": user.full_name if user else None,
                "heading": "A fresh code, as requested" if resend else ("Admin sign in" if is_admin else "Sign in"),
                "intro": (
                    "Here is a new sign-in code. Any earlier code we sent you no longer works."
                    if resend
                    else "Use this one-time code to sign in to your SPUNI account."
                ),
                "ttl_minutes": settings.otp_ttl_minutes,
            },
        )
    else:
        logger.info("OTP requested for ineligible email (purpose=%s)", purpose)

    await db.commit()
    return issued


async def verify_otp(
    db: AsyncSession,
    *,
    email: str,
    code: str,
    purpose: OtpPurpose,
    full_name: str | None,
    user_agent: str | None,
    ip: str | None,
) -> LoginResult:
    email = email.lower()
    now = utcnow()
    invalid = Unauthorized("That code is incorrect or has expired. Request a new code.", code="otp_invalid")

    otp = (
        await db.execute(
            select(OtpCode)
            .where(
                OtpCode.email == email,
                OtpCode.purpose == purpose,
                OtpCode.consumed_at.is_(None),
                OtpCode.invalidated_at.is_(None),
            )
            .order_by(OtpCode.created_at.desc(), OtpCode.id.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if otp is None or otp.expires_at <= now:
        raise invalid

    if otp.attempts >= settings.otp_max_attempts:
        otp.invalidated_at = now
        await db.commit()
        raise Unauthorized("Too many incorrect attempts. Request a new code.", code="otp_locked")

    if not constant_time_equals(otp.code_hash, hash_otp(email, purpose, code)):
        otp.attempts += 1
        remaining = settings.otp_max_attempts - otp.attempts
        if remaining <= 0:
            otp.invalidated_at = now
        await db.commit()
        if remaining <= 0:
            raise Unauthorized("Too many incorrect attempts. Request a new code.", code="otp_locked")
        raise Unauthorized(
            f"That code is incorrect. {remaining} attempt{'s' if remaining != 1 else ''} left.",
            code="otp_incorrect",
            details={"attempts_left": remaining},
        )

    otp.consumed_at = now

    user = (await db.execute(select(User).where(User.email == email).with_for_update())).scalar_one_or_none()
    is_new = False
    if user is None:
        if purpose == OtpPurpose.ADMIN_LOGIN:  # pragma: no cover - guarded at request time
            raise invalid
        user = User(email=email, full_name=full_name, role=UserRole.CUSTOMER, email_verified_at=now)
        db.add(user)
        await db.flush()
        db.add(Wallet(user_id=user.id))
        is_new = True
    else:
        if not user.is_active:
            raise Unauthorized("This account is disabled. Please contact support.", code="account_disabled")
        if purpose == OtpPurpose.ADMIN_LOGIN and user.role != UserRole.ADMIN:
            raise invalid
        if full_name and not user.full_name:
            user.full_name = full_name
        user.email_verified_at = user.email_verified_at or now
    user.last_login_at = now

    audience = _audience_for(purpose)
    refresh = await _create_session(db, user, audience, user_agent=user_agent, ip=ip)
    access, expires_in = create_access_token(user.id, user.role, audience)
    await db.commit()
    await db.refresh(user)
    return LoginResult(user, access, expires_in, refresh, is_new)


async def _create_session(
    db: AsyncSession, user: User, audience: Audience, *, user_agent: str | None, ip: str | None,
    family_id: UUID | None = None,
) -> str:
    token = new_refresh_token()
    days = settings.admin_refresh_token_ttl_days if audience == Audience.ADMIN else settings.refresh_token_ttl_days
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(token),
            family_id=family_id or uuid4(),
            audience=audience,
            expires_at=utcnow() + timedelta(days=days),
            user_agent=(user_agent or "")[:255] or None,
            ip_address=ip,
        )
    )
    return token


async def rotate_refresh_token(
    db: AsyncSession, *, token: str, audience: Audience, user_agent: str | None, ip: str | None
) -> LoginResult:
    now = utcnow()
    session = (
        await db.execute(
            select(AuthSession).where(AuthSession.token_hash == hash_token(token)).with_for_update()
        )
    ).scalar_one_or_none()
    if session is None or session.audience != audience:
        raise Unauthorized("Session expired. Please sign in again.", code="session_invalid")

    if session.revoked_at is not None or session.rotated_at is not None:
        # Refresh token reuse: treat the whole family as compromised.
        await db.execute(
            update(AuthSession)
            .where(AuthSession.family_id == session.family_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.commit()
        logger.warning("Refresh token reuse detected for user %s", session.user_id)
        raise Unauthorized("Session expired. Please sign in again.", code="session_reused")

    if session.expires_at <= now:
        raise Unauthorized("Session expired. Please sign in again.", code="session_expired")

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Session expired. Please sign in again.", code="session_invalid")
    if audience == Audience.ADMIN and user.role != UserRole.ADMIN:
        raise Unauthorized("Session expired. Please sign in again.", code="session_invalid")

    session.rotated_at = now
    new_token = await _create_session(db, user, audience, user_agent=user_agent, ip=ip, family_id=session.family_id)
    access, expires_in = create_access_token(user.id, user.role, audience)
    await db.commit()
    return LoginResult(user, access, expires_in, new_token, False)


async def revoke_refresh_token(db: AsyncSession, token: str) -> None:
    session = (
        await db.execute(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    ).scalar_one_or_none()
    if session is not None:
        await db.execute(
            update(AuthSession)
            .where(AuthSession.family_id == session.family_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        await db.commit()


async def revoke_all_sessions(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )

