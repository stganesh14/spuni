from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.schemas.common import Email, InputModel, OutputModel, PersonName, Phone

OtpCode = Annotated[str, Field(pattern=r"^[0-9]{6}$", description="6-digit code from the email")]


class OtpRequestIn(InputModel):
    email: Email


class OtpVerifyIn(InputModel):
    email: Email
    code: OtpCode
    full_name: PersonName | None = None


class OtpRequestOut(OutputModel):
    message: str
    resend_after_seconds: int
    expires_in_seconds: int


class UserOut(OutputModel):
    id: int
    email: str
    full_name: str | None
    phone: str | None
    role: str
    marketing_opt_in: bool
    created_at: datetime


class TokenOut(OutputModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    is_new_user: bool = False


class ProfileUpdateIn(InputModel):
    full_name: PersonName | None = None
    phone: Phone = None
    marketing_opt_in: bool | None = None
