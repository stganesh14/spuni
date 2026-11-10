"""Token, OTP and code hashing helpers."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import jwt

from app.core.config import settings
from app.models.enums import Audience

ISSUER = "spuni-api"


def utcnow() -> datetime:
    return datetime.now(UTC)


def generate_otp(length: int | None = None) -> str:
    length = length or settings.otp_length
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def hash_otp(email: str, purpose: str, code: str) -> str:
    """Keyed hash so a database leak does not reveal live OTPs."""
    message = f"{email.lower()}|{purpose}|{code}".encode()
    return hmac.new(settings.otp_pepper.get_secret_value().encode(), message, hashlib.sha256).hexdigest()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def keyed_hash(value: str) -> str:
    """HMAC used for gift card codes and other secrets that must be looked up."""
    return hmac.new(
        settings.secret_key.get_secret_value().encode(), value.encode(), hashlib.sha256
    ).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def new_url_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def create_access_token(user_id: int, role: str, audience: Audience) -> tuple[str, int]:
    ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    now = utcnow()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "aud": audience.value,
        "iss": ISSUER,
        "iat": now,
        "nbf": now,
        "exp": now + ttl,
        "jti": uuid4().hex,
        "typ": "access",
    }
    token = jwt.encode(payload, settings.secret_key.get_secret_value(), algorithm=settings.jwt_algorithm)
    return token, int(ttl.total_seconds())


def decode_access_token(token: str, audience: Audience) -> dict[str, Any]:
    payload = jwt.decode(
        token,
        settings.secret_key.get_secret_value(),
        algorithms=[settings.jwt_algorithm],
        audience=audience.value,
        issuer=ISSUER,
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
    )
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("Wrong token type")
    return payload
