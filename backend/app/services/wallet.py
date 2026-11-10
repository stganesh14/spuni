"""SPUNI Wallet ledger. Every balance change writes an immutable transaction row
while the wallet row is locked, so balances can always be reconciled."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models import Wallet, WalletTransaction
from app.models.enums import WalletTxnReason, WalletTxnType


async def get_wallet(db: AsyncSession, user_id: int, *, lock: bool = False) -> Wallet:
    query = select(Wallet).where(Wallet.user_id == user_id)
    if lock:
        query = query.with_for_update()
    wallet = (await db.execute(query)).scalar_one_or_none()
    if wallet is None:
        await db.execute(insert(Wallet).values(user_id=user_id).on_conflict_do_nothing())
        await db.flush()
        wallet = (await db.execute(query)).scalar_one()
    return wallet


async def _already_applied(db: AsyncSession, order_id: int | None, reason: WalletTxnReason) -> bool:
    if order_id is None:
        return False
    existing = await db.scalar(
        select(WalletTransaction.id).where(
            WalletTransaction.order_id == order_id, WalletTransaction.reason == reason
        )
    )
    return existing is not None


async def credit(
    db: AsyncSession, *, user_id: int, amount_paise: int, reason: WalletTxnReason,
    order_id: int | None = None, gift_card_id: int | None = None, note: str | None = None,
    created_by_id: int | None = None, earned: bool = False,
) -> WalletTransaction | None:
    if amount_paise <= 0:
        return None
    wallet = await get_wallet(db, user_id, lock=True)
    if await _already_applied(db, order_id, reason):
        return None  # idempotent
    wallet.balance_paise += amount_paise
    if earned:
        wallet.lifetime_earned_paise += amount_paise
    txn = WalletTransaction(
        user_id=user_id, type=WalletTxnType.CREDIT, reason=reason, amount_paise=amount_paise,
        balance_after_paise=wallet.balance_paise, order_id=order_id, gift_card_id=gift_card_id,
        note=note, created_by_id=created_by_id,
    )
    db.add(txn)
    await db.flush()
    return txn


async def debit(
    db: AsyncSession, *, user_id: int, amount_paise: int, reason: WalletTxnReason,
    order_id: int | None = None, note: str | None = None, created_by_id: int | None = None,
    allow_partial: bool = False,
) -> int:
    """Debit the wallet. Returns the amount actually debited."""
    if amount_paise <= 0:
        return 0
    wallet = await get_wallet(db, user_id, lock=True)
    if await _already_applied(db, order_id, reason):
        return 0
    if wallet.balance_paise < amount_paise:
        if not allow_partial:
            raise AppError("Your SPUNI Wallet balance has changed. Please review your order.",
                           code="wallet_insufficient")
        amount_paise = wallet.balance_paise
        if amount_paise <= 0:
            return 0
    wallet.balance_paise -= amount_paise
    db.add(
        WalletTransaction(
            user_id=user_id, type=WalletTxnType.DEBIT, reason=reason, amount_paise=amount_paise,
            balance_after_paise=wallet.balance_paise, order_id=order_id, note=note,
            created_by_id=created_by_id,
        )
    )
    await db.flush()
    return amount_paise
