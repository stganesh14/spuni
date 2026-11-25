"""Cart pricing, checkout, payments and customer orders."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Customer, OptionalCustomer
from app.core.errors import AppError, Forbidden
from app.core.ratelimit import rate_limit
from app.models import Order, Payment
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


@router.post("/payments/failed", response_model=Message, dependencies=[Depends(rate_limit("payment-failed", 30, 60))])
async def payment_failed(body: PaymentFailIn, db: DB, user: Customer) -> Message:
    await order_service.mark_payment_failed(db, order_number=body.order_number,
                                            provider_order_id=body.provider_order_id, user_id=user.id,
                                            reason=body.reason, error_code=body.error_code, source="checkout",
                                            provider_payment_id=body.provider_payment_id)
    return Message(message="Payment was not completed. You can retry from your order.")


@router.post("/payments/razorpay/webhook", include_in_schema=False)
async def razorpay_webhook(
    request: Request, db: DB, x_razorpay_signature: Annotated[str | None, Header()] = None
) -> dict[str, str]:
    body = await request.body()
    if not gateway.verify_webhook(body, x_razorpay_signature):
        raise Forbidden("Invalid signature.", code="webhook_signature_invalid")
    try:
        payload = await request.json()
    except ValueError:
        raise AppError("Invalid webhook payload.", code="webhook_payload_invalid", status_code=400) from None
    if not isinstance(payload, dict):
        raise AppError("Invalid webhook payload.", code="webhook_payload_invalid", status_code=400)
    event = payload.get("event")
    payload_data = payload.get("payload")
    if not isinstance(event, str) or not isinstance(payload_data, dict):
        return {"status": "ignored"}

    if event in {"payment.captured", "payment.authorized", "payment.failed"}:
        payment_data = payload_data.get("payment")
        entity = payment_data.get("entity") if isinstance(payment_data, dict) else None
        if not isinstance(entity, dict):
            return {"status": "ignored"}
        order_id, payment_id = entity.get("order_id"), entity.get("id")
        if (
            not isinstance(order_id, str) or not order_id.startswith("order_")
            or not isinstance(payment_id, str) or not payment_id.startswith("pay_")
        ):
            return {"status": "ignored"}
        order_number = await db.scalar(
            select(Order.number).join(Payment, Payment.order_id == Order.id)
            .where(Payment.provider_order_id == order_id).limit(1)
        )
        if order_number is None:
            return {"status": "ignored"}
        order = await order_service.get_order(db, order_number)
        if event == "payment.captured":
            await order_service.confirm_payment(
                db, order_number=order.number, provider_order_id=order_id, provider_payment_id=payment_id,
                signature=gateway.sign(order_id, payment_id), user_id=None, source="webhook",
            )
        elif event == "payment.authorized":
            await order_service.mark_payment_authorized(
                db, order_number=order.number, provider_order_id=order_id, provider_payment_id=payment_id,
                method=entity.get("method"), amount_paise=entity.get("amount"), currency=entity.get("currency"),
            )
        elif event == "payment.failed":
            await order_service.mark_payment_failed(
                db, order_number=order.number, provider_order_id=order_id, user_id=None,
                reason=entity.get("error_description"), error_code=entity.get("error_code"),
                source="razorpay_webhook", provider_payment_id=payment_id,
                amount_paise=entity.get("amount"), currency=entity.get("currency"),
            )
    elif event in {"refund.created", "refund.processed", "refund.failed"}:
        refund_data = payload_data.get("refund")
        entity = refund_data.get("entity") if isinstance(refund_data, dict) else None
        if not isinstance(entity, dict):
            return {"status": "ignored"}
        try:
            amount = int(entity.get("amount", 0))
        except (TypeError, ValueError):
            return {"status": "ignored"}
        await order_service.mark_refund_event(
            db, provider_payment_id=entity.get("payment_id"), refund_id=entity.get("id"),
            amount_paise=amount, status=event.removeprefix("refund."),
            reason=entity.get("error_description") or entity.get("error_reason"),
        )
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
