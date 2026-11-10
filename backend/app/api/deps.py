"""Shared FastAPI dependencies: database session and authentication."""

from typing import Annotated

import jwt
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.models.enums import Audience, UserRole

DB = Annotated[AsyncSession, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False)


async def _user_from_token(
    db: AsyncSession, credentials: HTTPAuthorizationCredentials | None, audience: Audience
) -> User | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    try:
        payload = decode_access_token(credentials.credentials, audience)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise Unauthorized("Your session has expired. Please sign in again.", code="token_invalid") from None
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Your session has expired. Please sign in again.", code="token_invalid")
    return user


async def optional_customer(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> User | None:
    return await _user_from_token(db, credentials, Audience.CUSTOMER)


async def current_customer(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> User:
    user = await _user_from_token(db, credentials, Audience.CUSTOMER)
    if user is None:
        raise Unauthorized("Please sign in to continue.", code="login_required")
    return user


async def current_admin(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> User:
    user = await _user_from_token(db, credentials, Audience.ADMIN)
    if user is None:
        raise Unauthorized("Please sign in to continue.", code="login_required")
    if user.role != UserRole.ADMIN:
        raise Forbidden("Admin access required.")
    return user


async def require_spa_header(x_requested_with: Annotated[str | None, Header()] = None) -> None:
    """Cookie-authenticated endpoints require a custom header, which cross-site
    forms cannot send and cross-origin scripts can only send after a CORS preflight."""
    if x_requested_with != "spuni":
        raise Forbidden("Missing request header.", code="csrf_header_missing")


def client_meta(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    return request.headers.get("user-agent"), ip


Customer = Annotated[User, Depends(current_customer)]
OptionalCustomer = Annotated[User | None, Depends(optional_customer)]
Admin = Annotated[User, Depends(current_admin)]
