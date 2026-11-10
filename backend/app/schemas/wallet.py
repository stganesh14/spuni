from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.schemas.common import Email, InputModel, OutputModel, PersonName, PositivePaise, SafeText


class WalletTxnOut(OutputModel):
    id: int
    type: str
    reason: str
    amount_paise: int
    balance_after_paise: int
    note: str | None
    order_number: str | None = None
    created_at: datetime


class WalletOut(OutputModel):
    balance_paise: int
    lifetime_earned_paise: int
    earn_percent: int
    max_redeem_percent: int
    transactions: list[WalletTxnOut]


class GiftCardPurchaseIn(InputModel):
    amount_paise: PositivePaise
    recipient_name: PersonName
    recipient_email: Email
    sender_name: PersonName
    message: SafeText(0, 300) | None = None
    idempotency_key: Annotated[str, Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


GiftCode = Annotated[str, Field(min_length=12, max_length=24, pattern=r"^[A-Za-z0-9-]+$")]


class GiftCardRedeemIn(InputModel):
    code: GiftCode


class GiftCardOut(OutputModel):
    id: int
    amount_paise: int
    recipient_name: str
    recipient_email: str
    sender_name: str
    message: str | None
    status: str
    code_last4: str | None
    activated_at: datetime | None
    expires_at: datetime | None
    redeemed_at: datetime | None
    created_at: datetime
    order_number: str | None = None


class GiftConfigOut(OutputModel):
    min_paise: int
    max_paise: int
    presets_paise: list[int]
    validity_days: int
    gift_wrap_paise: int
