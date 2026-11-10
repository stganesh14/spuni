"""Customer and admin authentication endpoints (email OTP)."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response

from app.api.deps import DB, Customer, client_meta, require_spa_header
from app.core.config import settings
from app.core.errors import Unauthorized
from app.core.ratelimit import rate_limit
from app.models.enums import Audience, OtpPurpose
from app.schemas.auth import OtpRequestIn, OtpRequestOut, OtpVerifyIn, ProfileUpdateIn, TokenOut, UserOut
from app.schemas.common import Message
from app.services import auth as auth_service

CUSTOMER_COOKIE = "spuni_rt"
ADMIN_COOKIE = "spuni_admin_rt"

router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])

otp_limit = Depends(rate_limit("otp-request", 10, 600))
verify_limit = Depends(rate_limit("otp-verify", 30, 600))
refresh_limit = Depends(rate_limit("refresh", 300, 600))
admin_refresh_limit = Depends(rate_limit("admin-refresh", 120, 600))


def _set_cookie(response: Response, name: str, token: str, audience: Audience) -> None:
    days = settings.admin_refresh_token_ttl_days if audience == Audience.ADMIN else settings.refresh_token_ttl_days
    path = f"{settings.api_prefix}/admin/auth" if audience == Audience.ADMIN else f"{settings.api_prefix}/auth"
    response.set_cookie(
        name,
        token,
        max_age=days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path=path,
    )


def _clear_cookie(response: Response, name: str, audience: Audience) -> None:
    path = f"{settings.api_prefix}/admin/auth" if audience == Audience.ADMIN else f"{settings.api_prefix}/auth"
    response.delete_cookie(name, path=path, domain=settings.cookie_domain, secure=settings.cookie_secure,
                           httponly=True, samesite=settings.cookie_samesite)


def _token_out(result: auth_service.LoginResult) -> TokenOut:
    return TokenOut(
        access_token=result.access_token,
        expires_in=result.expires_in,
        user=UserOut.model_validate(result.user),
        is_new_user=result.is_new_user,
    )


def _otp_out(issued: auth_service.OtpIssued, email: str) -> OtpRequestOut:
    return OtpRequestOut(
        message=f"If {email} can sign in, a 6-digit code is on its way. Check your inbox and spam folder.",
        resend_after_seconds=issued.resend_after_seconds,
        expires_in_seconds=issued.expires_in_seconds,
    )


# ---------------------------------------------------------------- customer


@router.post("/otp/request", response_model=OtpRequestOut, dependencies=[otp_limit])
async def request_code(body: OtpRequestIn, request: Request, db: DB) -> OtpRequestOut:
    _, ip = client_meta(request)
    issued = await auth_service.request_otp(db, email=body.email, purpose=OtpPurpose.LOGIN, ip=ip)
    return _otp_out(issued, body.email)


@router.post("/otp/resend", response_model=OtpRequestOut, dependencies=[otp_limit],
             summary="Forgot / didn't receive the OTP: send a fresh code")
async def resend_code(body: OtpRequestIn, request: Request, db: DB) -> OtpRequestOut:
    _, ip = client_meta(request)
    issued = await auth_service.request_otp(db, email=body.email, purpose=OtpPurpose.LOGIN, ip=ip, resend=True)
    return _otp_out(issued, body.email)


@router.post("/otp/verify", response_model=TokenOut, dependencies=[verify_limit])
async def verify_code(body: OtpVerifyIn, request: Request, response: Response, db: DB) -> TokenOut:
    ua, ip = client_meta(request)
    result = await auth_service.verify_otp(
        db, email=body.email, code=body.code, purpose=OtpPurpose.LOGIN, full_name=body.full_name,
        user_agent=ua, ip=ip,
    )
    _set_cookie(response, CUSTOMER_COOKIE, result.refresh_token, Audience.CUSTOMER)
    return _token_out(result)


@router.post("/refresh", response_model=TokenOut, dependencies=[refresh_limit, Depends(require_spa_header)])
async def refresh(
    request: Request, response: Response, db: DB,
    spuni_rt: Annotated[str | None, Cookie()] = None,
) -> TokenOut:
    if not spuni_rt:
        raise Unauthorized("Not signed in.", code="no_session")
    ua, ip = client_meta(request)
    try:
        result = await auth_service.rotate_refresh_token(
            db, token=spuni_rt, audience=Audience.CUSTOMER, user_agent=ua, ip=ip
        )
    except Unauthorized:
        _clear_cookie(response, CUSTOMER_COOKIE, Audience.CUSTOMER)
        raise
    _set_cookie(response, CUSTOMER_COOKIE, result.refresh_token, Audience.CUSTOMER)
    return _token_out(result)


@router.post("/logout", response_model=Message, dependencies=[Depends(require_spa_header)])
async def logout(response: Response, db: DB, spuni_rt: Annotated[str | None, Cookie()] = None) -> Message:
    if spuni_rt:
        await auth_service.revoke_refresh_token(db, spuni_rt)
    _clear_cookie(response, CUSTOMER_COOKIE, Audience.CUSTOMER)
    return Message(message="Signed out.")


@router.get("/me", response_model=UserOut)
async def me(user: Customer) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: ProfileUpdateIn, user: Customer, db: DB) -> UserOut:
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "full_name" and value is None:
            continue
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


# ------------------------------------------------------------------- admin


@admin_router.post("/otp/request", response_model=OtpRequestOut, dependencies=[otp_limit])
async def admin_request_code(body: OtpRequestIn, request: Request, db: DB) -> OtpRequestOut:
    _, ip = client_meta(request)
    issued = await auth_service.request_otp(db, email=body.email, purpose=OtpPurpose.ADMIN_LOGIN, ip=ip)
    return _otp_out(issued, body.email)


@admin_router.post("/otp/resend", response_model=OtpRequestOut, dependencies=[otp_limit])
async def admin_resend_code(body: OtpRequestIn, request: Request, db: DB) -> OtpRequestOut:
    _, ip = client_meta(request)
    issued = await auth_service.request_otp(
        db, email=body.email, purpose=OtpPurpose.ADMIN_LOGIN, ip=ip, resend=True
    )
    return _otp_out(issued, body.email)


@admin_router.post("/otp/verify", response_model=TokenOut, dependencies=[verify_limit])
async def admin_verify_code(body: OtpVerifyIn, request: Request, response: Response, db: DB) -> TokenOut:
    ua, ip = client_meta(request)
    result = await auth_service.verify_otp(
        db, email=body.email, code=body.code, purpose=OtpPurpose.ADMIN_LOGIN, full_name=None,
        user_agent=ua, ip=ip,
    )
    _set_cookie(response, ADMIN_COOKIE, result.refresh_token, Audience.ADMIN)
    return _token_out(result)


@admin_router.post("/refresh", response_model=TokenOut,
                   dependencies=[admin_refresh_limit, Depends(require_spa_header)])
async def admin_refresh(
    request: Request, response: Response, db: DB,
    spuni_admin_rt: Annotated[str | None, Cookie()] = None,
) -> TokenOut:
    if not spuni_admin_rt:
        raise Unauthorized("Not signed in.", code="no_session")
    ua, ip = client_meta(request)
    try:
        result = await auth_service.rotate_refresh_token(
            db, token=spuni_admin_rt, audience=Audience.ADMIN, user_agent=ua, ip=ip
        )
    except Unauthorized:
        _clear_cookie(response, ADMIN_COOKIE, Audience.ADMIN)
        raise
    _set_cookie(response, ADMIN_COOKIE, result.refresh_token, Audience.ADMIN)
    return _token_out(result)


@admin_router.post("/logout", response_model=Message, dependencies=[Depends(require_spa_header)])
async def admin_logout(
    response: Response, db: DB, spuni_admin_rt: Annotated[str | None, Cookie()] = None
) -> Message:
    if spuni_admin_rt:
        await auth_service.revoke_refresh_token(db, spuni_admin_rt)
    _clear_cookie(response, ADMIN_COOKIE, Audience.ADMIN)
    return Message(message="Signed out.")
