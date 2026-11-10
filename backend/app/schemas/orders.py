from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.schemas.account import AddressIn
from app.schemas.common import Email, InputModel, OutputModel, PersonName, SafeText


class CartLineIn(InputModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=10)


CartLines = Annotated[list[CartLineIn], Field(min_length=1, max_length=30)]


class GiftOptionsIn(InputModel):
    recipient_name: PersonName
    recipient_email: Email | None = None
    message: SafeText(0, 300) | None = None
    gift_wrap: bool = True
    hide_prices: bool = True


class QuoteIn(InputModel):
    items: CartLines
    use_wallet: bool = False
    gift_wrap: bool = False


class QuoteLine(OutputModel):
    product_id: int
    name: str
    slug: str
    image_url: str | None
    unit_price_paise: int
    quantity: int
    line_total_paise: int
    available_quantity: int
    issue: str | None = None


class QuoteOut(OutputModel):
    lines: list[QuoteLine]
    subtotal_paise: int
    shipping_paise: int
    gift_wrap_paise: int
    wallet_balance_paise: int
    wallet_applied_paise: int
    total_paise: int
    wallet_reward_estimate_paise: int
    free_shipping_threshold_paise: int
    has_issues: bool


class CheckoutIn(InputModel):
    items: CartLines
    address_id: int | None = Field(default=None, gt=0)
    address: AddressIn | None = None
    save_address: bool = True
    use_wallet: bool = False
    gift: GiftOptionsIn | None = None
    note: SafeText(0, 500) | None = None
    idempotency_key: Annotated[str, Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]

    @model_validator(mode="after")
    def _one_address(self) -> "CheckoutIn":
        if (self.address_id is None) == (self.address is None):
            raise ValueError("provide either address_id or address")
        return self


class PaymentInitOut(OutputModel):
    order_number: str
    provider: Literal["mock", "razorpay"]
    key_id: str | None
    provider_order_id: str
    amount_paise: int
    currency: str
    name: str
    description: str
    prefill_email: str
    prefill_name: str | None
    prefill_contact: str | None
    requires_payment: bool = True


class PaymentVerifyIn(InputModel):
    order_number: Annotated[str, Field(pattern=r"^SPN[0-9A-Z-]{6,20}$")]
    provider_order_id: Annotated[str, Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9_]+$")]
    provider_payment_id: Annotated[str, Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9_]+$")]
    signature: Annotated[str, Field(min_length=32, max_length=128, pattern=r"^[a-f0-9]+$")]


class PaymentFailIn(InputModel):
    order_number: Annotated[str, Field(pattern=r"^SPN[0-9A-Z-]{6,20}$")]
    provider_order_id: Annotated[str, Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9_]+$")]
    reason: SafeText(0, 300) | None = None


class OrderItemOut(OutputModel):
    id: int
    product_id: int | None
    product_name: str
    product_slug: str | None
    sku: str | None
    image_url: str | None
    unit_price_paise: int
    quantity: int
    line_total_paise: int


class OrderEventOut(OutputModel):
    status: str
    note: str | None
    created_at: datetime


class OrderSummaryOut(OutputModel):
    number: str
    order_type: str
    status: str
    payment_status: str
    total_paise: int
    item_count: int
    first_image_url: str | None
    created_at: datetime


class OrderOut(OutputModel):
    number: str
    order_type: str
    status: str
    payment_status: str
    email: str
    subtotal_paise: int
    shipping_paise: int
    gift_wrap_paise: int
    wallet_redeemed_paise: int
    total_paise: int
    wallet_earned_paise: int
    ship_name: str | None
    ship_phone: str | None
    ship_line1: str | None
    ship_line2: str | None
    ship_landmark: str | None
    ship_city: str | None
    ship_state: str | None
    ship_postal_code: str | None
    is_gift: bool
    gift_wrap: bool
    gift_recipient_name: str | None
    gift_message: str | None
    customer_note: str | None
    courier: str | None
    tracking_number: str | None
    tracking_url: str | None
    paid_at: datetime | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    cancelled_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    items: list[OrderItemOut]
    events: list[OrderEventOut]
    can_cancel: bool = False
