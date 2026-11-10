"""Housekeeping: expire unpaid orders and prune old auth data."""

import logging
from datetime import timedelta

from sqlalchemy import delete, select

from app.core.security import utcnow
from app.db.session import SessionLocal
from app.models import AuthSession, Order, OtpCode
from app.models.enums import OrderStatus, PaymentStatus
from app.services.orders import expire_order, get_order

logger = logging.getLogger("spuni.maintenance")


async def expire_unpaid_orders() -> int:
    async with SessionLocal() as db:
        numbers = (
            await db.execute(
                select(Order.number)
                .where(Order.status == OrderStatus.PENDING_PAYMENT, Order.payment_status != PaymentStatus.PAID,
                       Order.expires_at < utcnow())
                .limit(200)
            )
        ).scalars().all()
    expired = 0
    for number in numbers:
        async with SessionLocal() as db:
            order = await get_order(db, number, lock=True)
            if order.status == OrderStatus.PENDING_PAYMENT and order.expires_at and order.expires_at < utcnow():
                await expire_order(db, order)
                await db.commit()
                expired += 1
    if expired:
        logger.info("Expired %s unpaid orders", expired)
    return expired


async def prune_auth_data() -> None:
    async with SessionLocal() as db:
        cutoff = utcnow() - timedelta(days=7)
        await db.execute(delete(OtpCode).where(OtpCode.created_at < cutoff))
        await db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow() - timedelta(days=30)))
        await db.commit()


_last_prune = None


async def run_maintenance() -> None:
    global _last_prune
    await expire_unpaid_orders()
    if _last_prune is None or utcnow() - _last_prune > timedelta(hours=6):
        await prune_auth_data()
        _last_prune = utcnow()
