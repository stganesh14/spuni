from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin
from app.models.enums import Audience, OtpPurpose, UserRole, check_in

EMAIL_CHECK = r"email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'"
PHONE_CHECK = r"phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'"


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(EMAIL_CHECK, name="email_format"),
        CheckConstraint(PHONE_CHECK, name="phone_format"),
        CheckConstraint("full_name IS NULL OR length(trim(full_name)) >= 2", name="full_name_len"),
        check_in("role", UserRole),
    )

    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(16))
    role: Mapped[str] = mapped_column(
        String(16), nullable=False, default=UserRole.CUSTOMER, server_default=UserRole.CUSTOMER
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    marketing_opt_in: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    addresses: Mapped[list["Address"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", order_by="Address.id"
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


class OtpCode(IdMixin, Base):
    __tablename__ = "otp_codes"
    __table_args__ = (
        CheckConstraint(EMAIL_CHECK, name="email_format"),
        CheckConstraint("attempts >= 0 AND attempts <= 50", name="attempts_range"),
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        check_in("purpose", OtpPurpose),
        Index("ix_otp_codes_email_purpose_created", "email", "purpose", "created_at"),
    )

    email: Mapped[str] = mapped_column(String(254), nullable=False)
    purpose: Mapped[str] = mapped_column(String(16), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request_ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuthSession(IdMixin, Base):
    """A refresh-token session. Only the SHA-256 of the token is stored."""

    __tablename__ = "auth_sessions"
    __table_args__ = (
        check_in("audience", Audience),
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        Index("ix_auth_sessions_family", "family_id"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    family_id: Mapped[UUID] = mapped_column(nullable=False)
    audience: Mapped[str] = mapped_column(String(16), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship()


class Address(IdMixin, TimestampMixin, Base):
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint(r"phone ~ '^\+?[0-9]{10,15}$'", name="phone_format"),
        CheckConstraint(r"postal_code ~ '^[1-9][0-9]{5}$'", name="postal_code_format"),
        CheckConstraint("length(trim(full_name)) >= 2", name="full_name_len"),
        CheckConstraint("length(trim(line1)) >= 3", name="line1_len"),
        CheckConstraint("country = 'IN'", name="country_supported"),
        Index(
            "uq_addresses_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str | None] = mapped_column(String(40))
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(16), nullable=False)
    line1: Mapped[str] = mapped_column(String(200), nullable=False)
    line2: Mapped[str | None] = mapped_column(String(200))
    landmark: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(6), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IN", server_default="IN")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    user: Mapped[User] = relationship(back_populates="addresses")
