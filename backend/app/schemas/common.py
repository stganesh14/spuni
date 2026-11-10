"""Reusable schema building blocks and validators."""

import re
from typing import Annotated, Generic, TypeVar

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, EmailStr, Field

T = TypeVar("T")

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_NAME_RE = re.compile(r"^[A-Za-zÀ-ɏऀ-෿][A-Za-zÀ-ɏऀ-෿ .'-]{1,119}$")
_PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class InputModel(BaseModel):
    """Base for request bodies: strips whitespace and rejects unknown fields."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class OutputModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _clean_text(value: str) -> str:
    if _CONTROL_CHARS.search(value):
        raise ValueError("contains invalid control characters")
    return value


def _lower_email(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


def _normalize_phone(value: object) -> object:
    if isinstance(value, str):
        cleaned = re.sub(r"[\s\-().]", "", value)
        if cleaned and not cleaned.startswith("+") and len(cleaned) == 10:
            cleaned = "+91" + cleaned
        return cleaned or None
    return value


def _check_phone(value: str | None) -> str | None:
    if value is not None and not _PHONE_RE.match(value):
        raise ValueError("enter a valid phone number (10 digits, optionally with country code)")
    return value


def _check_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value)
    if not _NAME_RE.match(value):
        raise ValueError("enter a valid name (letters, spaces, . ' - only)")
    return value


def _check_slug(value: str) -> str:
    if not _SLUG_RE.match(value):
        raise ValueError("use lowercase letters, numbers and single hyphens")
    return value


Email = Annotated[EmailStr, BeforeValidator(_lower_email), Field(max_length=254)]
Phone = Annotated[str | None, BeforeValidator(_normalize_phone), AfterValidator(_check_phone)]
RequiredPhone = Annotated[str, BeforeValidator(_normalize_phone), AfterValidator(_check_phone)]
PersonName = Annotated[str, Field(min_length=2, max_length=120), AfterValidator(_check_name)]
Slug = Annotated[str, Field(min_length=2, max_length=140), AfterValidator(_check_slug)]


def SafeText(min_length: int = 0, max_length: int = 500):  # noqa: N802 - type factory
    return Annotated[str, Field(min_length=min_length, max_length=max_length), AfterValidator(_clean_text)]


Paise = Annotated[int, Field(ge=0, le=100_000_000)]
PositivePaise = Annotated[int, Field(gt=0, le=100_000_000)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Message(BaseModel):
    message: str


def paginate_meta(total: int, page: int, page_size: int) -> dict[str, int]:
    return {"total": total, "page": page, "page_size": page_size, "pages": max(1, -(-total // page_size))}
