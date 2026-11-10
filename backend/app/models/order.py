from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin
from app.models.enums import (
    GiftCardStatus,
    OrderStatus,
    OrderType,
    PaymentAttemptStatus,
    PaymentProvider,
    PaymentStatus,
    WalletTxnReason,
    WalletTxnType,
    check_in,
)
from app.models.user import User


class Order(IdMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        check_in("status", OrderStatus),
        check_in("payment_status", PaymentStatus),
        check_in("order_type", OrderType),
        CheckConstraint("subtotal_paise >= 0", name="subtotal_non_negative"),
        CheckConstraint("shipping_paise >= 0", name="shipping_non_negative"),
        CheckConstraint("gift_wrap_paise >= 0", name="gift_wrap_non_negative"),
        CheckConstraint("wallet_redeemed_paise >= 0", name="wallet_redeemed_non_negative"),
        CheckConstraint("wallet_earned_paise >= 0", name="wallet_earned_non_negative"),
        CheckConstraint(
            "total_paise = subtotal_paise + shipping_paise + gift_wrap_paise - wallet_redeemed_paise",
            name="total_consistent",
        ),
        CheckConstraint("total_paise >= 0", name="total_non_negative"),
        CheckConstraint("currency = 'INR'", name="currency_supported"),
        CheckConstraint(
            "NOT is_gift OR (gift_recipient_name IS NOT NULL AND length(trim(gift_recipient_name)) >= 2)",
            name="gift_requires_recipient",
        ),
        CheckConstraint(
            "order_type = 'gift_card' OR ("
            "ship_name IS NOT NULL AND ship_phone IS NOT NULL AND ship_line1 IS NOT NULL "
            "AND ship_city IS NOT NULL AND ship_state IS NOT NULL "
            "AND ship_postal_code ~ '^[1-9][0-9]{5}$')",
            name="product_order_requires_address",
        ),
        UniqueConstraint("user_id", "idempotency_key"),
        Index("ix_orders_user_created", "user_id", "created_at"),
        Index("ix_orders_status_created", "status", "created_at"),
    )

    number: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    order_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default=OrderType.PRODUCT, server_default=OrderType.PRODUCT
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=OrderStatus.PENDING_PAYMENT, server_default=OrderStatus.PENDING_PAYMENT
    )
    payment_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=PaymentStatus.PENDING, server_default=PaymentStatus.PENDING
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    email: Mapped[str] = mapped_column(String(254), nullable=False)

    subtotal_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    shipping_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    gift_wrap_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    wallet_redeemed_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    wallet_earned_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")

    # Shipping address snapshot (immutable once the order is placed)
    ship_name: Mapped[str | None] = mapped_column(String(120))
    ship_phone: Mapped[str | None] = mapped_column(String(16))
    ship_line1: Mapped[str | None] = mapped_column(String(200))
    ship_line2: Mapped[str | None] = mapped_column(String(200))
    ship_landmark: Mapped[str | None] = mapped_column(String(120))
    ship_city: Mapped[str | None] = mapped_column(String(80))
    ship_state: Mapped[str | None] = mapped_column(String(80))
    ship_postal_code: Mapped[str | None] = mapped_column(String(6))
    ship_country: Mapped[str] = mapped_column(String(2), nullable=False, default="IN", server_default="IN")

    # Gifting
    is_gift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    gift_wrap: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    gift_recipient_name: Mapped[str | None] = mapped_column(String(120))
    gift_recipient_email: Mapped[str | None] = mapped_column(String(254))
    gift_message: Mapped[str | None] = mapped_column(String(300))
    gift_hide_prices: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    customer_note: Mapped[str | None] = mapped_column(String(500))
    admin_note: Mapped[str | None] = mapped_column(Text)
    courier: Mapped[str | None] = mapped_column(String(60))
    tracking_number: Mapped[str | None] = mapped_column(String(60))
    tracking_url: Mapped[str | None] = mapped_column(String(300))

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stock_released: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    user: Mapped[User] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
    events: Mapped[list["OrderEvent"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderEvent.id"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="Payment.id"
    )


class OrderItem(IdMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 10", name="quantity_range"),
        CheckConstraint("unit_price_paise > 0", name="unit_price_positive"),
        CheckConstraint("line_total_paise = unit_price_paise * quantity", name="line_total_consistent"),
    )

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("products.id", ondelete="SET NULL"))
    product_name: Mapped[str] = mapped_column(String(120), nullable=False)
    product_slug: Mapped[str | None] = mapped_column(String(140))
    sku: Mapped[str | None] = mapped_column(String(40))
    image_url: Mapped[str | None] = mapped_column(String(500))
    unit_price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderEvent(IdMixin, Base):
    __tablename__ = "order_events"
    __table_args__ = (check_in("status", OrderStatus),)

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship(back_populates="events")


class Payment(IdMixin, TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        check_in("provider", PaymentProvider),
        check_in("status", PaymentAttemptStatus),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint("currency = 'INR'", name="currency_supported"),
    )

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    signature: Mapped[str | None] = mapped_column(String(128))
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=PaymentAttemptStatus.CREATED, server_default=PaymentAttemptStatus.CREATED
    )
    method: Mapped[str | None] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_description: Mapped[str | None] = mapped_column(String(500))
    raw_payload: Mapped[dict | None] = mapped_column(JSONB)

    order: Mapped[Order] = relationship(back_populates="payments")


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (CheckConstraint("balance_paise >= 0", name="balance_non_negative"),)

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    balance_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    lifetime_earned_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class WalletTransaction(IdMixin, Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        check_in("type", WalletTxnType),
        check_in("reason", WalletTxnReason),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint("balance_after_paise >= 0", name="balance_after_non_negative"),
        # Each order can only be rewarded / redeemed / reversed once per reason.
        Index(
            "uq_wallet_txn_order_reason",
            "order_id",
            "reason",
            unique=True,
            postgresql_where=text("order_id IS NOT NULL"),
        ),
        Index("ix_wallet_txn_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("wallets.user_id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(8), nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    order_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("orders.id", ondelete="SET NULL"))
    gift_card_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("gift_cards.id", ondelete="SET NULL"), unique=True
    )
    note: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class GiftCard(IdMixin, TimestampMixin, Base):
    """An e-gift card. Only a hash of the redemption code is stored."""

    __tablename__ = "gift_cards"
    __table_args__ = (
        check_in("status", GiftCardStatus),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint(
            r"recipient_email = lower(recipient_email) AND recipient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'",
            name="recipient_email_format",
        ),
        CheckConstraint("length(trim(recipient_name)) >= 2", name="recipient_name_len"),
        CheckConstraint(
            "(status = 'redeemed') = (redeemed_at IS NOT NULL)", name="redeemed_consistent"
        ),
    )

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    purchaser_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    code_last4: Mapped[str | None] = mapped_column(String(4))
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sender_name: Mapped[str] = mapped_column(String(120), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(254), nullable=False)
    message: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=GiftCardStatus.PENDING_PAYMENT,
        server_default=GiftCardStatus.PENDING_PAYMENT,
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    redeemed_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship()


class StoreSettings(Base):
    """Singleton row (id = 1) of store-wide business rules editable from admin."""

    __tablename__ = "store_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="singleton"),
        CheckConstraint("wallet_earn_percent BETWEEN 0 AND 50", name="earn_percent_range"),
        CheckConstraint("wallet_max_redeem_percent BETWEEN 0 AND 100", name="redeem_percent_range"),
        CheckConstraint("shipping_flat_paise >= 0", name="shipping_non_negative"),
        CheckConstraint("free_shipping_threshold_paise >= 0", name="threshold_non_negative"),
        CheckConstraint("gift_wrap_paise >= 0", name="gift_wrap_non_negative"),
        CheckConstraint(
            "gift_card_min_paise > 0 AND gift_card_max_paise >= gift_card_min_paise", name="gift_card_range"
        ),
        CheckConstraint("gift_card_validity_days BETWEEN 30 AND 1825", name="gift_card_validity_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    wallet_earn_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    wallet_max_redeem_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=20, server_default="20")
    shipping_flat_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=15000, server_default="15000")
    free_shipping_threshold_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=300000, server_default="300000"
    )
    gift_wrap_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=9900, server_default="9900")
    gift_card_min_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=50000, server_default="50000")
    gift_card_max_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=5000000, server_default="5000000"
    )
    gift_card_validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365, server_default="365")
    support_email: Mapped[str] = mapped_column(
        String(254), nullable=False, default="spunileathers@gmail.com", server_default="spunileathers@gmail.com"
    )
    support_phone: Mapped[str] = mapped_column(
        String(20), nullable=False, default="+919176969556", server_default="+919176969556"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
