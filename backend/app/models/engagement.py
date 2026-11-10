from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin
from app.models.catalog import Product
from app.models.enums import (
    ContactMessageStatus,
    ContactPreference,
    CustomizationKind,
    CustomizationStatus,
    EmailStatus,
    check_in,
)
from app.models.user import User

EMAIL_RE = r"'^[^@\s]+@[^@\s]+\.[^@\s]+$'"


class CustomizationRequest(IdMixin, TimestampMixin, Base):
    __tablename__ = "customization_requests"
    __table_args__ = (
        check_in("kind", CustomizationKind),
        check_in("status", CustomizationStatus),
        check_in("preferred_contact", ContactPreference),
        CheckConstraint("length(trim(details)) >= 10", name="details_len"),
        CheckConstraint("budget_paise IS NULL OR budget_paise > 0", name="budget_positive"),
        CheckConstraint("quoted_price_paise IS NULL OR quoted_price_paise > 0", name="quote_positive"),
        CheckConstraint(r"phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'", name="phone_format"),
        CheckConstraint(
            "preferred_contact = 'email' OR phone IS NOT NULL", name="phone_required_for_call"
        ),
        CheckConstraint("kind <> 'catalog' OR product_id IS NOT NULL", name="catalog_requires_product"),
        Index("ix_customization_status_created", "status", "created_at"),
    )

    reference: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    product_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("products.id", ondelete="SET NULL"))
    details: Mapped[str] = mapped_column(Text, nullable=False)
    personalization_text: Mapped[str | None] = mapped_column(String(60))
    budget_paise: Mapped[int | None] = mapped_column(BigInteger)
    preferred_contact: Mapped[str] = mapped_column(String(16), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(16))
    preferred_time: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=CustomizationStatus.NEW, server_default=CustomizationStatus.NEW
    )
    quoted_price_paise: Mapped[int | None] = mapped_column(BigInteger)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    customer_visible_note: Mapped[str | None] = mapped_column(String(1000))

    user: Mapped[User] = relationship()
    product: Mapped[Product | None] = relationship()
    files: Mapped[list["CustomizationFile"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="CustomizationFile.id"
    )


class CustomizationFile(IdMixin, Base):
    __tablename__ = "customization_files"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="size_positive"),
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')",
            name="content_type_allowed",
        ),
    )

    request_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customization_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str] = mapped_column(String(200), nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    request: Mapped[CustomizationRequest] = relationship(back_populates="files")


class ContactMessage(IdMixin, TimestampMixin, Base):
    __tablename__ = "contact_messages"
    __table_args__ = (
        check_in("status", ContactMessageStatus),
        CheckConstraint(f"email = lower(email) AND email ~ {EMAIL_RE}", name="email_format"),
        CheckConstraint("length(trim(message)) >= 10", name="message_len"),
        CheckConstraint("length(trim(name)) >= 2", name="name_len"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default=ContactMessageStatus.NEW, server_default=ContactMessageStatus.NEW
    )
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))


class EmailOutbox(IdMixin, Base):
    """Transactional outbox: emails are committed with the business change and
    delivered by a background worker with retries."""

    __tablename__ = "email_outbox"
    __table_args__ = (
        check_in("status", EmailStatus),
        CheckConstraint("attempts >= 0", name="attempts_non_negative"),
        Index("ix_email_outbox_status_send_after", "status", "send_after"),
    )

    to_email: Mapped[str] = mapped_column(String(254), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    template: Mapped[str] = mapped_column(String(60), nullable=False)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default=EmailStatus.PENDING, server_default=EmailStatus.PENDING
    )
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(String(500))
    send_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
