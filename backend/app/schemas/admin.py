import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.models.enums import CustomizationStatus, Gender, LaunchStatus, OrderStatus
from app.schemas.common import (
    InputModel,
    OutputModel,
    Paise,
    PositivePaise,
    SafeText,
    Slug,
)
from app.schemas.orders import OrderOut

Url = Annotated[str, Field(max_length=500, pattern=r"^(/media/|https://)[^\s<>\"']+$")]
RelativeLink = Annotated[str, Field(max_length=300, pattern=r"^(/[A-Za-z0-9/_\-?=&.%]*|https://[^\s<>\"']+)$")]
Sku = Annotated[str, Field(pattern=r"^[A-Z0-9-]{3,40}$")]


class CategoryIn(InputModel):
    name: SafeText(2, 80)
    slug: Slug
    tagline: SafeText(0, 160) | None = None
    description: SafeText(0, 4000) | None = None
    image_url: Url | None = None
    banner_url: Url | None = None
    sort_order: int = Field(default=0, ge=0, le=10000)
    is_active: bool = True
    show_in_menu: bool = True


class AdminCategoryOut(OutputModel):
    id: int
    name: str
    slug: str
    tagline: str | None
    description: str | None
    image_url: str | None
    banner_url: str | None
    sort_order: int
    is_active: bool
    show_in_menu: bool
    product_count: int = 0
    created_at: datetime
    updated_at: datetime


class ProductImageIn(InputModel):
    url: Url
    alt: SafeText(0, 160) | None = None


class ProductIn(InputModel):
    category_id: int = Field(gt=0)
    name: SafeText(2, 120)
    slug: Slug
    sku: Sku
    short_description: SafeText(0, 280) | None = None
    description: SafeText(0, 8000) | None = None
    price_paise: PositivePaise
    compare_at_price_paise: PositivePaise | None = None
    stock: int = Field(ge=0, le=1_000_000)
    gender: Gender = Gender.UNISEX
    material: SafeText(0, 120) | None = None
    color: SafeText(0, 60) | None = None
    dimensions: SafeText(0, 120) | None = None
    weight_grams: int | None = Field(default=None, gt=0, le=100_000)
    care_instructions: SafeText(0, 2000) | None = None
    badge: SafeText(0, 30) | None = None
    is_active: bool = True
    is_featured: bool = False
    is_bestseller: bool = False
    is_customizable: bool = False
    sort_order: int = Field(default=0, ge=0, le=10000)
    meta_title: SafeText(0, 160) | None = None
    meta_description: SafeText(0, 300) | None = None
    images: list[ProductImageIn] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def _compare_price(self) -> "ProductIn":
        if self.compare_at_price_paise is not None and self.compare_at_price_paise <= self.price_paise:
            raise ValueError("compare-at price must be higher than the price")
        return self


class StockAdjustIn(InputModel):
    stock: int = Field(ge=0, le=1_000_000)


class AdminImageOut(OutputModel):
    id: int
    url: str
    alt: str | None
    sort_order: int


class AdminProductOut(OutputModel):
    id: int
    category_id: int
    category_name: str
    name: str
    slug: str
    sku: str
    short_description: str | None
    description: str | None
    price_paise: int
    compare_at_price_paise: int | None
    stock: int
    gender: str
    material: str | None
    color: str | None
    dimensions: str | None
    weight_grams: int | None
    care_instructions: str | None
    badge: str | None
    is_active: bool
    is_featured: bool
    is_bestseller: bool
    is_customizable: bool
    sort_order: int
    meta_title: str | None
    meta_description: str | None
    images: list[AdminImageOut]
    created_at: datetime
    updated_at: datetime


class LaunchIn(InputModel):
    title: SafeText(2, 120)
    slug: Slug
    tagline: SafeText(0, 160) | None = None
    description: SafeText(0, 4000) | None = None
    image_url: Url | None = None
    launch_at: datetime | None = None
    status: LaunchStatus = LaunchStatus.DRAFT
    category_id: int | None = Field(default=None, gt=0)
    product_id: int | None = Field(default=None, gt=0)
    sort_order: int = Field(default=0, ge=0, le=10000)


class AdminLaunchOut(OutputModel):
    id: int
    title: str
    slug: str
    tagline: str | None
    description: str | None
    image_url: str | None
    launch_at: datetime | None
    status: str
    category_id: int | None
    product_id: int | None
    sort_order: int
    notified_at: datetime | None
    notify_count: int
    subscriber_count: int = 0
    pending_count: int = 0
    created_at: datetime


class LaunchNotifyIn(InputModel):
    message: SafeText(0, 500) | None = None
    mark_launched: bool = True


class LaunchNotifyOut(OutputModel):
    queued: int
    message: str


class LaunchSubscriberOut(OutputModel):
    email: str
    created_at: datetime
    notified_at: datetime | None
    unsubscribed_at: datetime | None


class BannerIn(InputModel):
    title_one: SafeText(1, 80)
    title_two: SafeText(0, 80) | None = None
    image_url: Url
    alt: SafeText(0, 160) | None = None
    link_url: RelativeLink | None = None
    sort_order: int = Field(default=0, ge=0, le=10000)
    is_active: bool = True


class AdminBannerOut(OutputModel):
    id: int
    title_one: str
    title_two: str | None
    image_url: str
    alt: str | None
    link_url: str | None
    sort_order: int
    is_active: bool


class OrderStatusIn(InputModel):
    status: OrderStatus
    note: SafeText(0, 500) | None = None
    courier: SafeText(0, 60) | None = None
    tracking_number: Annotated[str, Field(max_length=60, pattern=r"^[A-Za-z0-9-]*$")] | None = None
    tracking_url: Annotated[str, Field(max_length=300, pattern=r"^(https://[^\s<>\"']+)?$")] | None = None
    notify_customer: bool = True


class AdminNoteIn(InputModel):
    admin_note: SafeText(0, 4000) | None = None


class AdminOrderRow(OutputModel):
    number: str
    order_type: str
    status: str
    payment_status: str
    total_paise: int
    item_count: int
    customer_name: str | None
    email: str
    is_gift: bool
    created_at: datetime
    allowed_transitions: list[str]


class AdminPaymentOut(OutputModel):
    provider: str
    provider_order_id: str
    provider_payment_id: str | None
    amount_paise: int
    status: str
    method: str | None
    error_description: str | None
    created_at: datetime


class AdminOrderOut(OrderOut):
    id: int
    user_id: int
    admin_note: str | None
    gift_recipient_email: str | None
    gift_hide_prices: bool
    payments: list[AdminPaymentOut]
    allowed_transitions: list[str] = []


class AdminCustomerRow(OutputModel):
    id: int
    email: str
    full_name: str | None
    phone: str | None
    role: str
    is_active: bool
    order_count: int = 0
    total_spent_paise: int = 0
    wallet_balance_paise: int = 0
    wallet_cash_value_paise: int = 100
    last_login_at: datetime | None
    created_at: datetime


class CustomerUpdateIn(InputModel):
    is_active: bool | None = None
    role: Literal["customer", "admin"] | None = None


class WalletAdjustIn(InputModel):
    direction: Literal["credit", "debit"]
    amount_cash_hundredths: PositivePaise
    note: SafeText(3, 300)
    notify_customer: bool = True


class CustomizationUpdateIn(InputModel):
    status: CustomizationStatus | None = None
    quoted_price_paise: PositivePaise | None = None
    admin_notes: SafeText(0, 4000) | None = None
    customer_visible_note: SafeText(0, 1000) | None = None
    notify_customer: bool = True


class AdminCustomizationOut(OutputModel):
    reference: str
    kind: str
    status: str
    user_id: int
    customer_email: str
    customer_name: str | None
    product_id: int | None
    product_name: str | None
    details: str
    personalization_text: str | None
    budget_paise: int | None
    preferred_contact: str
    phone: str | None
    preferred_time: str | None
    quoted_price_paise: int | None
    admin_notes: str | None
    customer_visible_note: str | None
    files: list[dict]
    created_at: datetime
    updated_at: datetime


class StoreSettingsIn(InputModel):
    wallet_max_redeem_percent: int = Field(ge=0, le=100)
    wallet_cash_value_paise: PositivePaise
    wallet_tier_1_limit_paise: PositivePaise
    wallet_tier_2_limit_paise: PositivePaise
    wallet_tier_3_limit_paise: PositivePaise
    wallet_tier_1_percent: int = Field(ge=0, le=50)
    wallet_tier_2_percent: int = Field(ge=0, le=50)
    wallet_tier_3_percent: int = Field(ge=0, le=50)
    wallet_tier_4_percent: int = Field(ge=0, le=50)
    shipping_flat_paise: Paise
    free_shipping_threshold_paise: Paise
    gift_wrap_paise: Paise
    gift_card_min_paise: PositivePaise
    gift_card_max_paise: PositivePaise
    gift_card_validity_days: int = Field(ge=30, le=1825)
    support_email: Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    support_phone: Annotated[str, Field(pattern=r"^\+?[0-9]{10,15}$")]

    @model_validator(mode="after")
    def _ranges(self) -> "StoreSettingsIn":
        if self.wallet_cash_value_paise < 100:
            raise ValueError("one Spuni Cash must be worth at least ₹1")
        if not (
            self.wallet_tier_1_limit_paise < self.wallet_tier_2_limit_paise
            < self.wallet_tier_3_limit_paise
        ):
            raise ValueError("wallet reward limits must be strictly increasing")
        if self.gift_card_max_paise < self.gift_card_min_paise:
            raise ValueError("gift card maximum must be at least the minimum")
        return self


class StoreSettingsOut(StoreSettingsIn):
    model_config = {"from_attributes": True, "extra": "ignore"}
    updated_at: datetime


class ContactMessageOut(OutputModel):
    id: int
    name: str
    email: str
    phone: str | None
    subject: str
    message: str
    status: str
    created_at: datetime


class ContactStatusIn(InputModel):
    status: Literal["new", "read", "closed"]


class EmailLogOut(OutputModel):
    id: int
    to_email: str
    subject: str
    template: str
    status: str
    attempts: int
    last_error: str | None
    created_at: datetime
    sent_at: datetime | None

    @field_validator("subject")
    @classmethod
    def _hide_codes(cls, value: str) -> str:
        # Older rows carried the sign-in code in the subject; never show it to admins.
        return re.sub(r"\b\d{6}\b", "••••••", value)


class AdminGiftCardOut(OutputModel):
    id: int
    order_number: str
    amount_paise: int
    sender_name: str
    recipient_name: str
    recipient_email: str
    purchaser_email: str
    status: str
    code_last4: str | None
    activated_at: datetime | None
    expires_at: datetime | None
    redeemed_at: datetime | None
    created_at: datetime


class DashboardPoint(OutputModel):
    date: str
    revenue_paise: int
    orders: int


class DashboardOut(OutputModel):
    revenue_today_paise: int
    revenue_30d_paise: int
    orders_today: int
    orders_30d: int
    avg_order_value_paise: int
    pending_fulfilment: int
    awaiting_payment: int
    low_stock: list[dict]
    new_customers_30d: int
    open_customizations: int
    unread_messages: int
    launch_subscribers: int
    wallet_liability_paise: int
    series: list[DashboardPoint]
    top_products: list[dict]
    recent_orders: list[AdminOrderRow]
    status_breakdown: dict[str, int]
