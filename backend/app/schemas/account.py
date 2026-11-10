from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.schemas.common import InputModel, OutputModel, PersonName, RequiredPhone, SafeText

PostalCode = Annotated[str, Field(pattern=r"^[1-9][0-9]{5}$", description="6-digit Indian PIN code")]


class AddressIn(InputModel):
    label: SafeText(0, 40) | None = None
    full_name: PersonName
    phone: RequiredPhone
    line1: SafeText(3, 200)
    line2: SafeText(0, 200) | None = None
    landmark: SafeText(0, 120) | None = None
    city: SafeText(2, 80)
    state: SafeText(2, 80)
    postal_code: PostalCode
    is_default: bool = False


class AddressOut(OutputModel):
    id: int
    label: str | None
    full_name: str
    phone: str
    line1: str
    line2: str | None
    landmark: str | None
    city: str
    state: str
    postal_code: str
    country: str
    is_default: bool
    created_at: datetime
