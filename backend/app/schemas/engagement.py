from datetime import datetime

from app.schemas.common import Email, InputModel, OutputModel, PersonName, Phone, SafeText


class CustomizationFileOut(OutputModel):
    id: int
    url: str
    original_name: str
    content_type: str
    size_bytes: int


class CustomizationOut(OutputModel):
    reference: str
    kind: str
    product_id: int | None
    product_name: str | None = None
    product_slug: str | None = None
    details: str
    personalization_text: str | None
    budget_paise: int | None
    preferred_contact: str
    phone: str | None
    preferred_time: str | None
    status: str
    quoted_price_paise: int | None
    customer_visible_note: str | None
    files: list[CustomizationFileOut]
    created_at: datetime
    updated_at: datetime


class ContactIn(InputModel):
    name: PersonName
    email: Email
    phone: Phone = None
    subject: SafeText(3, 160)
    message: SafeText(10, 3000)
    # Honeypot field: real users never fill it.
    website: str | None = None


class StoreInfoOut(OutputModel):
    support_email: str
    support_phone: str
    shipping_flat_paise: int
    free_shipping_threshold_paise: int
    gift_wrap_paise: int
    wallet_earn_percent: int
    wallet_max_redeem_percent: int
    payment_mode: str
    razorpay_key_id: str | None
