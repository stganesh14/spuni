"""Cart pricing, checkout, payments and customer orders."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Customer, OptionalCustomer
from app.core.config import settings
from app.core.errors import AppError, Forbidden
from app.core.ratelimit import rate_limit
from app.models import Order
from app.schemas.common import InputModel, Message, Page, SafeText, paginate_meta
from app.schemas.orders import (
    CheckoutIn,
    OrderOut,
    OrderSummaryOut,
    PaymentFailIn,
    PaymentInitOut,
    PaymentVerifyIn,
    QuoteIn,
    QuoteOut,
)
from app.services import orders as order_service
from app.services import payment_gateway as gateway
from app.services import wallet as wallet_service
from app.services.pricing import price_cart, quote_out
from app.services.store import get_store_settings

router = APIRouter(tags=["shop"])


class CancelIn(InputModel):
    reason: SafeText(0, 300) | None = None


class MockCompleteIn(InputModel):
    order_number: Annotated[str, Field(pattern=r"^SPN[0-9A-Z-]{6,20}$")]
    provider_order_id: Annotated[str, Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9_]+$")]


@router.post("/cart/quote", response_model=QuoteOut, dependencies=[Depends(rate_limit("quote", 120, 60))])
async def quote(body: QuoteIn, db: DB, user: OptionalCustomer) -> QuoteOut:
    store = await get_store_settings(db)
    balance = (await wallet_service.get_wallet(db, user.id)).balance_paise if user else 0
    priced = await price_cart(db, items=body.items, settings=store, wallet_balance=balance,
                              use_wallet=body.use_wallet and user is not None, gift_wrap=body.gift_wrap)
    await db.commit()
    return quote_out(priced, store, balance)


@router.post("/checkout", response_model=PaymentInitOut, dependencies=[Depends(rate_limit("checkout", 20, 600))])
async def checkout(body: CheckoutIn, db: DB, user: Customer) -> PaymentInitOut:
    return await order_service.create_product_order(db, user, body)


@router.post("/orders/{number}/pay", response_model=PaymentInitOut,
             dependencies=[Depends(rate_limit("pay", 20, 600))])
async def retry_payment(number: str, db: DB, user: Customer) -> PaymentInitOut:
    order = await order_service.get_order(db, number, user_id=user.id, lock=True)
    return await order_service.payment_init(db, order, user)


@router.post("/payments/verify", response_model=OrderOut, dependencies=[Depends(rate_limit("verify", 30, 600))])
async def verify_payment(body: PaymentVerifyIn, db: DB, user: Customer) -> OrderOut:
    order = await order_service.confirm_payment(
        db, order_number=body.order_number, provider_order_id=body.provider_order_id,
        provider_payment_id=body.provider_payment_id, signature=body.signature, user_id=user.id, source="client",
    )
    order = await order_service.get_order(db, order.number, user_id=user.id)
    return order_service.order_out(order)


@router.post("/payments/failed", response_model=Message)
async def payment_failed(body: PaymentFailIn, db: DB, user: Customer) -> Message:
    await order_service.mark_payment_failed(db, order_number=body.order_number,
                                            provider_order_id=body.provider_order_id, user_id=user.id,
                                            reason=body.reason)
    return Message(message="Payment was not completed. You can retry from your order.")


@router.post("/payments/mock/complete", summary="Development only: simulates the Razorpay checkout popup")
async def mock_complete(body: MockCompleteIn, db: DB, user: Customer) -> dict[str, str]:
    if settings.payment_mode != "mock":
        raise Forbidden("Mock payments are disabled.", code="mock_disabled")
    order = await order_service.get_order(db, body.order_number, user_id=user.id)
    if not any(p.provider_order_id == body.provider_order_id for p in order.payments):
        raise AppError("Unknown payment.", code="payment_mismatch")
    payment_id, signature = gateway.mock_capture(body.provider_order_id)
    return {"provider_order_id": body.provider_order_id, "provider_payment_id": payment_id, "signature": signature}


@router.post("/payments/razorpay/webhook", include_in_schema=False)
async def razorpay_webhook(
    request: Request, db: DB, x_razorpay_signature: Annotated[str | None, Header()] = None
) -> dict[str, str]:
    body = await request.body()
    if not gateway.verify_webhook(body, x_razorpay_signature):
        raise Forbidden("Invalid signature.", code="webhook_signature_invalid")
    payload = await request.json()
    event = payload.get("event")
    entity = (payload.get("payload", {}).get("payment") or {}).get("entity") or {}
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    if not order_id or not payment_id:
        return {"status": "ignored"}
    from app.models import Payment

    payment = (await db.execute(select(Payment).where(Payment.provider_order_id == order_id)
                                .options(selectinload(Payment.order)))).scalar_one_or_none()
    if payment is None:
        return {"status": "ignored"}
    if event in ("payment.captured", "order.paid"):
        # The webhook is authenticated by its own signature; reuse the confirmation path.
        await order_service.confirm_payment(
            db, order_number=payment.order.number, provider_order_id=order_id, provider_payment_id=payment_id,
            signature=gateway.sign(order_id, payment_id), user_id=None, source="webhook",
        )
    elif event == "payment.failed":
        await order_service.mark_payment_failed(db, order_number=payment.order.number, provider_order_id=order_id,
                                                user_id=None, reason=entity.get("error_description"))
    return {"status": "ok"}


@router.get("/orders", response_model=Page[OrderSummaryOut])
async def my_orders(
    db: DB, user: Customer,
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
) -> Page[OrderSummaryOut]:
    base = select(Order).where(Order.user_id == user.id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        await db.execute(base.options(selectinload(Order.items)).order_by(Order.created_at.desc())
                         .offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return Page[OrderSummaryOut](items=[order_service.order_summary(o) for o in rows],
                                 **paginate_meta(total, page, page_size))


@router.get("/orders/{number}", response_model=OrderOut)
async def my_order(number: str, db: DB, user: Customer) -> OrderOut:
    return order_service.order_out(await order_service.get_order(db, number, user_id=user.id))


@router.post("/orders/{number}/cancel", response_model=OrderOut)
async def cancel_my_order(number: str, body: CancelIn, db: DB, user: Customer) -> OrderOut:
    order = await order_service.get_order(db, number, user_id=user.id, lock=True)
    await order_service.cancel_order(db, order, actor=user, reason=body.reason, by_admin=False)
    return order_service.order_out(await order_service.get_order(db, number, user_id=user.id))
