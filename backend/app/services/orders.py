"""Order lifecycle: checkout, payment confirmation, fulfilment, cancellation.

Money-safety rules enforced here (and backed by DB constraints):
* Prices, shipping, wallet usage and totals are computed on the server only.
* Stock is reserved under row locks at checkout and released exactly once.
* A payment is accepted only with a valid gateway signature for the exact
  gateway order we created, and the amount is cross-checked with the gateway.
* Confirmation is idempotent: verify callback and webhook can both arrive.
* Wallet movements are ledgered and unique per (order, reason).
"""

import logging
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.errors import AppError, Conflict, NotFound
from app.core.security import keyed_hash, utcnow
from app.models import Address, GiftCard, Order, OrderEvent, OrderItem, Payment, Product, User
from app.models.enums import (
    GiftCardStatus,
    OrderStatus,
    OrderType,
    PaymentAttemptStatus,
    PaymentStatus,
    WalletTxnReason,
)
from app.schemas.orders import CheckoutIn, OrderOut, OrderSummaryOut, PaymentInitOut
from app.schemas.wallet import GiftCardPurchaseIn
from app.services import payment_gateway as gateway
from app.services import wallet as wallet_service
from app.services.email import enqueue_email, rupees
from app.services.pricing import price_cart
from app.services.store import get_store_settings

logger = logging.getLogger("spuni.orders")

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.CONFIRMED: {OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.PROCESSING: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: {OrderStatus.REFUNDED},
}
CUSTOMER_CANCELLABLE = {OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED}

STATUS_COPY = {
    OrderStatus.PROCESSING: ("Your order is being crafted.",
                             "Our artisans have started preparing your order. We'll let you know when it ships."),
    OrderStatus.SHIPPED: ("Your order is on its way.",
                          "Your SPUNI order has left our atelier and is travelling to you."),
    OrderStatus.OUT_FOR_DELIVERY: ("Out for delivery today.",
                                   "Your order is out for delivery. Keep your phone close."),
    OrderStatus.DELIVERED: ("Delivered. Enjoy it.",
                            "Your order has been delivered. We hope it ages beautifully with you."),
    OrderStatus.CANCELLED: ("Your order has been cancelled.",
                            "Your order was cancelled. Any amount paid will be refunded to the original payment "
                            "method within 5-7 working days, and wallet points used have been returned."),
    OrderStatus.REFUNDED: ("Your refund has been issued.",
                           "We have issued a refund for your order. It usually reflects within 5-7 working days."),
}


# ------------------------------------------------------------------ helpers


def _random_code(length: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def new_order_number() -> str:
    return f"SPN{utcnow():%y%m%d}-{_random_code(6)}"


def _order_query():
    return select(Order).options(
        selectinload(Order.items), selectinload(Order.events), selectinload(Order.payments),
        selectinload(Order.user),
    )


async def get_order(db: AsyncSession, number: str, *, user_id: int | None = None, lock: bool = False) -> Order:
    query = _order_query().where(Order.number == number)
    if user_id is not None:
        query = query.where(Order.user_id == user_id)
    if lock:
        query = query.with_for_update(of=Order)
    order = (await db.execute(query)).scalar_one_or_none()
    if order is None:
        raise NotFound("We couldn't find that order.")
    return order


def order_out(order: Order) -> OrderOut:
    out = OrderOut.model_validate(order)
    out.can_cancel = _can_cancel(order, by_admin=False)
    return out


def order_summary(order: Order) -> OrderSummaryOut:
    return OrderSummaryOut(
        number=order.number,
        order_type=order.order_type,
        status=order.status,
        payment_status=order.payment_status,
        total_paise=order.total_paise,
        item_count=sum(i.quantity for i in order.items),
        first_image_url=next((i.image_url for i in order.items if i.image_url), None),
        created_at=order.created_at,
    )


def _event(order: Order, status: str, note: str | None = None, actor_id: int | None = None) -> None:
    order.events.append(OrderEvent(status=status, note=note, created_by_id=actor_id))


def _address_line(order: Order) -> str:
    parts = [order.ship_name, order.ship_line1, order.ship_line2, order.ship_landmark,
             f"{order.ship_city}, {order.ship_state} {order.ship_postal_code}"]
    return ", ".join(p for p in parts if p)


def _items_context(order: Order) -> list[dict]:
    return [{"name": i.product_name, "quantity": i.quantity, "line_total_paise": i.line_total_paise}
            for i in order.items]


async def _admin_alert(db: AsyncSession, headline: str, lines: list[str], path: str) -> None:
    store = await get_store_settings(db)
    await enqueue_email(
        db, to=store.support_email, subject=f"[SPUNI admin] {headline}", template="admin_alert",
        context={"headline": headline, "lines": lines, "url": f"{settings.admin_url.rstrip('/')}{path}"},
    )


# ----------------------------------------------------------------- checkout


async def _existing_by_key(db: AsyncSession, user_id: int, key: str) -> Order | None:
    return (
        await db.execute(_order_query().where(Order.user_id == user_id, Order.idempotency_key == key))
    ).scalar_one_or_none()


async def create_product_order(db: AsyncSession, user: User, body: CheckoutIn) -> PaymentInitOut:
    existing = await _existing_by_key(db, user.id, body.idempotency_key)
    if existing is not None:
        return await payment_init(db, existing, user)

    store = await get_store_settings(db)
    wallet = await wallet_service.get_wallet(db, user.id, lock=True)
    gift = body.gift
    priced = await price_cart(
        db, items=body.items, settings=store, wallet_balance=wallet.balance_paise,
        use_wallet=body.use_wallet, gift_wrap=bool(gift and gift.gift_wrap), lock=True,
    )
    if priced.issues or not priced.lines:
        raise Conflict("Some items in your bag changed. Please review your bag.", code="cart_changed",
                       details={"issues": priced.issues})

    # Address: saved (must belong to the user) or new.
    if body.address_id is not None:
        address = await db.get(Address, body.address_id)
        if address is None or address.user_id != user.id:
            raise NotFound("Address not found.")
        ship = {k: getattr(address, k) for k in
                ("full_name", "phone", "line1", "line2", "landmark", "city", "state", "postal_code")}
    else:
        assert body.address is not None
        ship = body.address.model_dump(exclude={"label", "is_default"})
        if body.save_address:
            has_any = await db.scalar(select(Address.id).where(Address.user_id == user.id).limit(1))
            db.add(Address(user_id=user.id, **body.address.model_dump(exclude={"is_default"}),
                           is_default=not has_any))
    if not user.phone:
        user.phone = ship["phone"]
    if not user.full_name:
        user.full_name = ship["full_name"]

    order = Order(
        number=new_order_number(),
        idempotency_key=body.idempotency_key,
        user_id=user.id,
        order_type=OrderType.PRODUCT,
        email=user.email,
        subtotal_paise=priced.subtotal_paise,
        shipping_paise=priced.shipping_paise,
        gift_wrap_paise=priced.gift_wrap_paise,
        wallet_redeemed_paise=priced.wallet_applied_paise,
        total_paise=priced.total_paise,
        wallet_earned_paise=0,
        ship_name=ship["full_name"], ship_phone=ship["phone"], ship_line1=ship["line1"],
        ship_line2=ship["line2"], ship_landmark=ship["landmark"], ship_city=ship["city"],
        ship_state=ship["state"], ship_postal_code=ship["postal_code"],
        is_gift=gift is not None,
        gift_wrap=bool(gift and gift.gift_wrap),
        gift_recipient_name=gift.recipient_name if gift else None,
        gift_recipient_email=gift.recipient_email if gift else None,
        gift_message=gift.message if gift else None,
        gift_hide_prices=gift.hide_prices if gift else True,
        customer_note=body.note,
        expires_at=utcnow() + timedelta(minutes=settings.pending_order_ttl_minutes),
        items=[],
        events=[],
        payments=[],
    )
    for line in priced.lines:
        product = priced.products[line.product_id]
        product.stock -= line.quantity  # rows are locked FOR UPDATE; CHECK(stock >= 0) is the backstop
        order.items.append(
            OrderItem(
                product_id=product.id, product_name=product.name, product_slug=product.slug, sku=product.sku,
                image_url=product.primary_image, unit_price_paise=line.unit_price_paise,
                quantity=line.quantity, line_total_paise=line.line_total_paise,
            )
        )
    _event(order, OrderStatus.PENDING_PAYMENT, "Order placed, awaiting payment.")
    db.add(order)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await _existing_by_key(db, user.id, body.idempotency_key)
        if existing is not None:
            return await payment_init(db, existing, user)
        raise

    if order.wallet_redeemed_paise:
        await wallet_service.debit(
            db, user_id=user.id, amount_paise=order.wallet_redeemed_paise, reason=WalletTxnReason.ORDER_REDEEM,
            order_id=order.id, note=f"Used on order {order.number}",
        )

    if order.total_paise == 0:
        await _mark_paid(db, order, payment=None)
        await db.commit()
        return _init_out(order, user, provider_order_id="wallet", requires_payment=False)

    return await payment_init(db, order, user, commit=True)


async def create_gift_card_order(db: AsyncSession, user: User, body: GiftCardPurchaseIn) -> PaymentInitOut:
    existing = await _existing_by_key(db, user.id, body.idempotency_key)
    if existing is not None:
        return await payment_init(db, existing, user)
    store = await get_store_settings(db)
    if not store.gift_card_min_paise <= body.amount_paise <= store.gift_card_max_paise:
        raise AppError(
            f"Gift cards can be between {rupees(store.gift_card_min_paise)} and {rupees(store.gift_card_max_paise)}.",
            code="gift_card_amount",
        )
    if body.amount_paise % 100:
        raise AppError("Gift card amount must be in whole rupees.", code="gift_card_amount")

    order = Order(
        number=new_order_number(), idempotency_key=body.idempotency_key, user_id=user.id,
        order_type=OrderType.GIFT_CARD, email=user.email, subtotal_paise=body.amount_paise,
        total_paise=body.amount_paise, expires_at=utcnow() + timedelta(minutes=settings.pending_order_ttl_minutes),
        is_gift=True, gift_recipient_name=body.recipient_name, gift_recipient_email=body.recipient_email,
        gift_message=body.message, items=[], events=[], payments=[],
    )
    order.items.append(
        OrderItem(product_name=f"SPUNI e-Gift Card for {body.recipient_name}", unit_price_paise=body.amount_paise,
                  quantity=1, line_total_paise=body.amount_paise)
    )
    _event(order, OrderStatus.PENDING_PAYMENT, "Gift card order placed, awaiting payment.")
    db.add(order)
    await db.flush()
    db.add(
        GiftCard(
            order_id=order.id, purchaser_id=user.id, amount_paise=body.amount_paise, sender_name=body.sender_name,
            recipient_name=body.recipient_name, recipient_email=body.recipient_email, message=body.message,
        )
    )
    return await payment_init(db, order, user, commit=True)


def _init_out(order: Order, user: User, *, provider_order_id: str, requires_payment: bool = True) -> PaymentInitOut:
    return PaymentInitOut(
        order_number=order.number,
        provider=settings.payment_mode,
        key_id=settings.razorpay_key_id if settings.payment_mode == "razorpay" else None,
        provider_order_id=provider_order_id,
        amount_paise=order.total_paise,
        currency="INR",
        name="SPUNI",
        description="SPUNI e-Gift Card" if order.order_type == OrderType.GIFT_CARD else f"Order {order.number}",
        prefill_email=user.email,
        prefill_name=user.full_name,
        prefill_contact=order.ship_phone or user.phone,
        requires_payment=requires_payment,
    )


async def payment_init(db: AsyncSession, order: Order, user: User, *, commit: bool = True) -> PaymentInitOut:
    """Create (or reuse) a gateway order for a pending order."""
    if order.payment_status == PaymentStatus.PAID:
        return _init_out(order, user, provider_order_id="paid", requires_payment=False)
    if order.status != OrderStatus.PENDING_PAYMENT:
        raise Conflict("This order can no longer be paid.", code="order_not_payable")
    if order.expires_at and order.expires_at <= utcnow():
        raise Conflict("This order expired. Please place it again.", code="order_expired")

    reusable = next(
        (p for p in reversed(order.payments)
         if p.status == PaymentAttemptStatus.CREATED and p.amount_paise == order.total_paise
         and p.provider == settings.payment_mode),
        None,
    )
    if reusable is None:
        created = await gateway.create_order(
            amount_paise=order.total_paise, receipt=order.number,
            notes={"order_number": order.number, "user_id": str(order.user_id)},
        )
        reusable = Payment(
            order_id=order.id, provider=created.provider, provider_order_id=created.provider_order_id,
            amount_paise=created.amount_paise, raw_payload=created.raw,
        )
        db.add(reusable)
    if commit:
        await db.commit()
    return _init_out(order, user, provider_order_id=reusable.provider_order_id)


# ------------------------------------------------------------ confirmation


async def confirm_payment(
    db: AsyncSession, *, order_number: str, provider_order_id: str, provider_payment_id: str, signature: str,
    user_id: int | None, source: str,
) -> Order:
    if not gateway.verify_signature(provider_order_id, provider_payment_id, signature):
        logger.warning("Invalid payment signature for order %s (source=%s)", order_number, source)
        raise AppError("Payment verification failed. If money was deducted it will be refunded automatically.",
                       code="payment_signature_invalid")

    order = await get_order(db, order_number, user_id=user_id, lock=True)
    payment = next((p for p in order.payments if p.provider_order_id == provider_order_id), None)
    if payment is None:
        raise AppError("Payment does not belong to this order.", code="payment_mismatch")

    if payment.status == PaymentAttemptStatus.CAPTURED:
        if payment.provider_payment_id != provider_payment_id:
            raise Conflict("This payment was already recorded with a different id.", code="payment_conflict")
        return order  # idempotent replay
    if order.payment_status == PaymentStatus.PAID:
        # Another attempt was already captured: this is a duplicate charge, refund it.
        await _refund_duplicate(db, order, payment, provider_payment_id)
        await db.commit()
        return order

    remote = await gateway.fetch_payment(provider_payment_id)
    if remote is not None:
        if remote.get("order_id") != provider_order_id or int(remote.get("amount", -1)) != payment.amount_paise:
            raise AppError("Payment details do not match the order.", code="payment_mismatch")
        if remote.get("status") not in ("captured", "authorized"):
            raise AppError("Payment is not complete yet.", code="payment_incomplete")
        payment.method = str(remote.get("method") or "")[:32] or None

    payment.provider_payment_id = provider_payment_id
    payment.signature = signature
    payment.status = PaymentAttemptStatus.CAPTURED
    if payment.amount_paise != order.total_paise:
        raise AppError("Payment amount does not match the order total.", code="payment_amount_mismatch")

    if order.status == OrderStatus.EXPIRED:
        if not await _re_reserve(db, order):
            await db.flush()
            order.payment_status = PaymentStatus.PAID
            order.paid_at = utcnow()
            await _issue_refund(db, order, note="Paid after the order expired and items were no longer available.")
            await db.commit()
            return order

    await _mark_paid(db, order, payment)
    await db.commit()
    return order


async def _re_reserve(db: AsyncSession, order: Order) -> bool:
    """Late payment for an expired order: take the stock again if it is still there.

    Orders that used wallet points are not revived (the points were already
    returned); they are refunded instead so the ledger stays exact."""
    if order.wallet_redeemed_paise:
        return False
    if order.order_type == OrderType.PRODUCT:
        ids = sorted(i.product_id for i in order.items if i.product_id)
        products = {
            p.id: p for p in (
                await db.execute(select(Product).where(Product.id.in_(ids)).order_by(Product.id).with_for_update())
            ).scalars().all()
        }
        for item in order.items:
            product = products.get(item.product_id or -1)
            if product is None or product.stock < item.quantity:
                return False
        for item in order.items:
            products[item.product_id].stock -= item.quantity  # type: ignore[index]
        order.stock_released = False
    else:
        card = (await db.execute(select(GiftCard).where(GiftCard.order_id == order.id).with_for_update())) \
            .scalar_one_or_none()
        if card is None:
            return False
        card.status = GiftCardStatus.PENDING_PAYMENT
    order.status = OrderStatus.PENDING_PAYMENT
    return True


async def _mark_paid(db: AsyncSession, order: Order, payment: Payment | None) -> None:
    now = utcnow()
    order.payment_status = PaymentStatus.PAID
    order.paid_at = now
    order.expires_at = None
    order.status = OrderStatus.CONFIRMED
    _event(order, OrderStatus.CONFIRMED, "Payment received." if payment else "Paid with SPUNI Wallet.")

    if order.order_type == OrderType.GIFT_CARD:
        await _activate_gift_card(db, order)
        return

    store = await get_store_settings(db)
    reward = order.subtotal_paise - order.wallet_redeemed_paise
    reward = max(0, reward) * store.wallet_earn_percent // 100
    reward -= reward % 100
    if reward > 0:
        txn = await wallet_service.credit(
            db, user_id=order.user_id, amount_paise=reward, reason=WalletTxnReason.ORDER_REWARD,
            order_id=order.id, note=f"Reward for order {order.number}", earned=True,
        )
        if txn is not None:
            order.wallet_earned_paise = reward

    await enqueue_email(
        db, to=order.email, subject=f"Order confirmed · {order.number}", template="order_confirmed",
        context={
            "name": order.ship_name, "number": order.number, "items": _items_context(order),
            "subtotal_paise": order.subtotal_paise, "shipping_paise": order.shipping_paise,
            "gift_wrap_paise": order.gift_wrap_paise, "wallet_redeemed_paise": order.wallet_redeemed_paise,
            "total_paise": order.total_paise, "wallet_earned_paise": order.wallet_earned_paise,
            "address": _address_line(order),
        },
    )
    await _admin_alert(
        db, f"New order {order.number} · {rupees(order.total_paise)}",
        [f"Customer: {order.ship_name} <{order.email}>", f"Items: {sum(i.quantity for i in order.items)}",
         f"Ship to: {_address_line(order)}", "Gift order" if order.is_gift else ""],
        f"/orders/{order.number}",
    )


async def _activate_gift_card(db: AsyncSession, order: Order) -> None:
    card = (await db.execute(select(GiftCard).where(GiftCard.order_id == order.id).with_for_update())).scalar_one()
    if card.status != GiftCardStatus.PENDING_PAYMENT:
        return
    store = await get_store_settings(db)
    raw = _random_code(12)
    display = f"SPUNI-{raw[0:4]}-{raw[4:8]}-{raw[8:12]}"
    card.code_hash = keyed_hash(normalize_gift_code(display))
    card.code_last4 = raw[-4:]
    card.status = GiftCardStatus.ACTIVE
    card.activated_at = utcnow()
    card.expires_at = utcnow() + timedelta(days=store.gift_card_validity_days)
    order.status = OrderStatus.DELIVERED
    order.delivered_at = utcnow()
    _event(order, OrderStatus.DELIVERED, f"Gift card emailed to {card.recipient_email}.")
    await enqueue_email(
        db, to=card.recipient_email, subject=f"{card.sender_name} sent you a SPUNI gift card",
        template="gift_card_received",
        context={
            "recipient_name": card.recipient_name, "sender_name": card.sender_name,
            "amount_paise": card.amount_paise, "message": card.message, "gift_code": display,
            "expires_on": f"{card.expires_at:%d %B %Y}",
        },
    )
    await enqueue_email(
        db, to=order.email, subject=f"Your SPUNI gift card is on its way · {order.number}",
        template="gift_card_purchased",
        context={"recipient_name": card.recipient_name, "recipient_email": card.recipient_email,
                 "amount_paise": card.amount_paise, "number": order.number, "code_last4": card.code_last4},
    )


def normalize_gift_code(code: str) -> str:
    cleaned = "".join(ch for ch in code.upper() if ch.isalnum())
    return cleaned[5:] if cleaned.startswith("SPUNI") else cleaned


async def mark_payment_failed(db: AsyncSession, *, order_number: str, provider_order_id: str,
                              user_id: int | None, reason: str | None) -> None:
    order = await get_order(db, order_number, user_id=user_id, lock=True)
    payment = next((p for p in order.payments if p.provider_order_id == provider_order_id), None)
    if payment is None or payment.status != PaymentAttemptStatus.CREATED:
        return
    payment.status = PaymentAttemptStatus.FAILED
    payment.error_description = (reason or "Payment failed or was cancelled")[:500]
    await db.commit()


async def _refund_duplicate(db: AsyncSession, order: Order, payment: Payment, provider_payment_id: str) -> None:
    payment.provider_payment_id = provider_payment_id
    payment.status = PaymentAttemptStatus.REFUNDED
    try:
        await gateway.refund(provider_payment_id, payment.amount_paise, {"reason": "duplicate", "order": order.number})
    except AppError:
        payment.error_description = "Duplicate payment: automatic refund failed, refund manually."
        await _admin_alert(db, f"Manual refund needed for {order.number}",
                           [f"Duplicate payment {provider_payment_id} could not be refunded automatically."],
                           f"/orders/{order.number}")


async def _issue_refund(db: AsyncSession, order: Order, note: str) -> None:
    captured = [p for p in order.payments if p.status == PaymentAttemptStatus.CAPTURED and p.provider_payment_id]
    failed = False
    for payment in captured:
        try:
            await gateway.refund(payment.provider_payment_id or "", payment.amount_paise,
                                 {"order": order.number, "reason": note[:200]})
            payment.status = PaymentAttemptStatus.REFUNDED
        except AppError:
            failed = True
    if captured:
        order.payment_status = PaymentStatus.REFUNDED if not failed else PaymentStatus.PAID
    if failed:
        await _admin_alert(db, f"Manual refund needed for {order.number}",
                           ["The automatic refund failed. Refund it from the Razorpay dashboard.", note],
                           f"/orders/{order.number}")
    if order.status not in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
        order.status = OrderStatus.CANCELLED
        order.cancelled_at = utcnow()
        _event(order, OrderStatus.CANCELLED, note)


# --------------------------------------------------------------- reversals


async def _release_stock(db: AsyncSession, order: Order) -> None:
    if order.stock_released or order.order_type != OrderType.PRODUCT:
        return
    ids = sorted({i.product_id for i in order.items if i.product_id})
    if ids:
        products = {
            p.id: p for p in (
                await db.execute(select(Product).where(Product.id.in_(ids)).order_by(Product.id).with_for_update())
            ).scalars().all()
        }
        for item in order.items:
            if item.product_id in products:
                products[item.product_id].stock += item.quantity
    order.stock_released = True


async def _reverse_wallet(db: AsyncSession, order: Order) -> None:
    if order.wallet_redeemed_paise:
        await wallet_service.credit(
            db, user_id=order.user_id, amount_paise=order.wallet_redeemed_paise,
            reason=WalletTxnReason.REDEEM_REVERSAL, order_id=order.id,
            note=f"Returned from order {order.number}",
        )
    if order.wallet_earned_paise:
        await wallet_service.debit(
            db, user_id=order.user_id, amount_paise=order.wallet_earned_paise,
            reason=WalletTxnReason.REWARD_REVERSAL, order_id=order.id,
            note=f"Reward reversed for order {order.number}", allow_partial=True,
        )


async def _abandon_pending(db: AsyncSession, order: Order, *, final_status: OrderStatus, note: str,
                           actor_id: int | None = None) -> None:
    await _release_stock(db, order)
    if order.wallet_redeemed_paise:
        await wallet_service.credit(
            db, user_id=order.user_id, amount_paise=order.wallet_redeemed_paise,
            reason=WalletTxnReason.REDEEM_REVERSAL, order_id=order.id,
            note=f"Returned from unpaid order {order.number}",
        )
    for payment in order.payments:
        if payment.status == PaymentAttemptStatus.CREATED:
            payment.status = PaymentAttemptStatus.FAILED
            payment.error_description = "Order closed before payment"
    if order.order_type == OrderType.GIFT_CARD:
        card = (await db.execute(select(GiftCard).where(GiftCard.order_id == order.id))).scalar_one_or_none()
        if card and card.status == GiftCardStatus.PENDING_PAYMENT:
            card.status = GiftCardStatus.CANCELLED
    order.status = final_status
    if final_status == OrderStatus.CANCELLED:
        order.cancelled_at = utcnow()
    _event(order, final_status, note, actor_id)


async def expire_order(db: AsyncSession, order: Order) -> None:
    if order.status != OrderStatus.PENDING_PAYMENT or order.payment_status == PaymentStatus.PAID:
        return
    await _abandon_pending(db, order, final_status=OrderStatus.EXPIRED, note="Payment window closed.")


def _can_cancel(order: Order, by_admin: bool) -> bool:
    if by_admin:
        return order.status == OrderStatus.PENDING_PAYMENT or \
            OrderStatus.CANCELLED in TRANSITIONS.get(order.status, set())
    return order.status in CUSTOMER_CANCELLABLE and order.order_type == OrderType.PRODUCT


async def cancel_order(db: AsyncSession, order: Order, *, actor: User, reason: str | None, by_admin: bool,
                       notify: bool = True) -> Order:
    if not _can_cancel(order, by_admin):
        raise Conflict("This order can no longer be cancelled.", code="not_cancellable")

    if order.status == OrderStatus.PENDING_PAYMENT:
        await _abandon_pending(db, order, final_status=OrderStatus.CANCELLED,
                               note=reason or "Cancelled before payment.", actor_id=actor.id)
        await db.commit()
        return order

    if order.order_type == OrderType.GIFT_CARD:
        card = (await db.execute(select(GiftCard).where(GiftCard.order_id == order.id).with_for_update())) \
            .scalar_one_or_none()
        if card and card.status == GiftCardStatus.REDEEMED:
            raise Conflict("This gift card has already been redeemed.", code="not_cancellable")
        if card:
            card.status = GiftCardStatus.CANCELLED

    await _release_stock(db, order)
    await _reverse_wallet(db, order)
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = utcnow()
    _event(order, OrderStatus.CANCELLED,
           reason or ("Cancelled by SPUNI." if by_admin else "Cancelled by customer."), actor.id)
    await _issue_refund(db, order, note=reason or "Order cancelled")
    if notify:
        await _notify_status(db, order, OrderStatus.CANCELLED, reason)
    await db.commit()
    return order


async def update_status(
    db: AsyncSession, order: Order, *, actor: User, status: OrderStatus, note: str | None,
    courier: str | None, tracking_number: str | None, tracking_url: str | None, notify: bool = True,
) -> Order:
    if status == OrderStatus.CANCELLED:
        return await cancel_order(db, order, actor=actor, reason=note, by_admin=True, notify=notify)
    if status not in TRANSITIONS.get(order.status, set()):
        raise Conflict(f"An order that is {order.status.replace('_', ' ')} cannot move to "
                       f"{status.replace('_', ' ')}.", code="invalid_transition")
    now = utcnow()
    if status == OrderStatus.SHIPPED:
        if not tracking_number:
            raise AppError("A tracking number is required to mark an order as shipped.", code="tracking_required")
        order.shipped_at = now
    if courier is not None:
        order.courier = courier or None
    if tracking_number is not None:
        order.tracking_number = tracking_number or None
    if tracking_url is not None:
        order.tracking_url = tracking_url or None
    if status == OrderStatus.DELIVERED:
        order.delivered_at = now
    order.status = status
    if status == OrderStatus.REFUNDED:
        await _reverse_wallet(db, order)
        await _issue_refund(db, order, note=note or "Refund issued")
    _event(order, status, note, actor.id)
    if notify:
        await _notify_status(db, order, status, note)
    await db.commit()
    return order


async def _notify_status(db: AsyncSession, order: Order, status: str, note: str | None) -> None:
    copy = STATUS_COPY.get(status)
    if copy is None or order.order_type != OrderType.PRODUCT:
        return
    headline, body = copy
    await enqueue_email(
        db, to=order.email, subject=f"{headline.rstrip('.')} · {order.number}", template="order_status",
        context={
            "number": order.number, "headline": headline, "body": body, "note": note,
            "courier": order.courier, "tracking_number": order.tracking_number, "tracking_url": order.tracking_url,
            "items": _items_context(order),
        },
    )
    if status == OrderStatus.SHIPPED and order.is_gift and order.gift_recipient_email:
        await enqueue_email(
            db, to=order.gift_recipient_email, subject="A SPUNI gift is on its way to you",
            template="gift_on_the_way",
            context={"recipient_name": order.gift_recipient_name or "there",
                     "sender_name": order.user.full_name or "Someone special",
                     "message": order.gift_message, "courier": order.courier},
        )
