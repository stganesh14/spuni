"""String enums shared by models, schemas and services.

Values are stored as VARCHAR with CHECK constraints (see ``check_in``) rather
than native PostgreSQL ENUM types, which keeps migrations simple while still
enforcing valid values at the database level.
"""

from enum import StrEnum

from sqlalchemy import CheckConstraint


class UserRole(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"


class OtpPurpose(StrEnum):
    LOGIN = "login"
    ADMIN_LOGIN = "admin_login"


class Audience(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"


class Gender(StrEnum):
    MEN = "men"
    WOMEN = "women"
    UNISEX = "unisex"


class LaunchStatus(StrEnum):
    DRAFT = "draft"
    UPCOMING = "upcoming"
    LAUNCHED = "launched"
    ARCHIVED = "archived"


class OrderType(StrEnum):
    PRODUCT = "product"
    GIFT_CARD = "gift_card"


class OrderStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    EXPIRED = "expired"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentProvider(StrEnum):
    MOCK = "mock"
    RAZORPAY = "razorpay"


class PaymentAttemptStatus(StrEnum):
    CREATED = "created"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"


class WalletTxnType(StrEnum):
    CREDIT = "credit"
    DEBIT = "debit"


class WalletTxnReason(StrEnum):
    ORDER_REWARD = "order_reward"
    ORDER_REDEEM = "order_redeem"
    REDEEM_REVERSAL = "redeem_reversal"
    REWARD_REVERSAL = "reward_reversal"
    GIFT_CARD = "gift_card"
    ADMIN_ADJUST = "admin_adjust"


class GiftCardStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    ACTIVE = "active"
    REDEEMED = "redeemed"
    CANCELLED = "cancelled"


class CustomizationKind(StrEnum):
    CATALOG = "catalog"
    UPLOAD = "upload"
    EXPERT = "expert"


class CustomizationStatus(StrEnum):
    NEW = "new"
    IN_REVIEW = "in_review"
    QUOTED = "quoted"
    ACCEPTED = "accepted"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ContactPreference(StrEnum):
    EMAIL = "email"
    PHONE = "phone"
    WHATSAPP = "whatsapp"


class ContactMessageStatus(StrEnum):
    NEW = "new"
    READ = "read"
    CLOSED = "closed"


class EmailStatus(StrEnum):
    PENDING = "pending"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"


def check_in(column: str, enum: type[StrEnum], name: str | None = None) -> CheckConstraint:
    values = ", ".join(f"'{member.value}'" for member in enum)
    return CheckConstraint(f"{column} IN ({values})", name=name or f"{column}_valid")
