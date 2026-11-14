from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.core.security import keyed_hash, utcnow
from app.models import GiftCard, User
from app.models.enums import GiftCardStatus, WalletTxnReason
from app.services import wallet as wallet_service
from app.services.email import enqueue_email
from app.services.orders import normalize_gift_code
from app.services.store import get_store_settings


async def redeem_gift_card(db: AsyncSession, user: User, code: str) -> GiftCard:
    normalized = normalize_gift_code(code)
    if len(normalized) != 12:
        raise NotFound("That gift code is not valid.", code="gift_code_invalid")
    card = (
        await db.execute(select(GiftCard).where(GiftCard.code_hash == keyed_hash(normalized)).with_for_update())
    ).scalar_one_or_none()
    if card is None or card.status in (GiftCardStatus.PENDING_PAYMENT, GiftCardStatus.CANCELLED):
        raise NotFound("That gift code is not valid.", code="gift_code_invalid")
    if card.status == GiftCardStatus.REDEEMED:
        raise AppError("This gift card has already been redeemed.", code="gift_code_used")
    if card.expires_at and card.expires_at <= utcnow():
        raise AppError("This gift card has expired.", code="gift_code_expired")

    card.status = GiftCardStatus.REDEEMED
    card.redeemed_at = utcnow()
    card.redeemed_by_id = user.id
    txn = await wallet_service.credit(
        db, user_id=user.id, amount_paise=card.amount_paise, reason=WalletTxnReason.GIFT_CARD,
        gift_card_id=card.id, note=f"Gift card from {card.sender_name}",
    )
    store = await get_store_settings(db)
    await enqueue_email(
        db, to=user.email, subject="Gift card added as Spuni Cash", template="wallet_credited",
        context={"amount_cash": wallet_service.format_cash(card.amount_paise, store.wallet_cash_value_paise),
                 "balance_cash": wallet_service.format_cash(
                     txn.balance_after_paise if txn else 0, store.wallet_cash_value_paise
                 ), "reason": f"Your gift card from {card.sender_name} is now in your wallet."},
    )
    await db.commit()
    return card
