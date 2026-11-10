"""Admin: dashboard, orders, customers, wallet, gift cards, customizations,
messages, email log and store settings."""

from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, case, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Admin, current_admin
from app.core.errors import AppError, Conflict, NotFound
from app.core.security import utcnow
from app.models import (
    ContactMessage,
    CustomizationRequest,
    EmailOutbox,
    GiftCard,
    LaunchSubscription,
    Order,
    OrderItem,
    Product,
    User,
    Wallet,
    WalletTransaction,
)
from app.models.enums import (
    ContactMessageStatus,
    CustomizationStatus,
    EmailStatus,
    OrderStatus,
    PaymentStatus,
    UserRole,
    WalletTxnReason,
)
from app.schemas.admin import (
    AdminCustomerRow,
    AdminCustomizationOut,
    AdminGiftCardOut,
    AdminNoteIn,
    AdminOrderOut,
    AdminOrderRow,
    ContactMessageOut,
    ContactStatusIn,
    CustomerUpdateIn,
    CustomizationUpdateIn,
    DashboardOut,
    DashboardPoint,
    EmailLogOut,
    OrderStatusIn,
    StoreSettingsIn,
    StoreSettingsOut,
    WalletAdjustIn,
)
from app.schemas.auth import UserOut
from app.schemas.common import Page, paginate_meta
from app.schemas.wallet import WalletTxnOut
from app.services import orders as order_service
from app.services import wallet as wallet_service
from app.services.auth import revoke_all_sessions
from app.services.email import enqueue_email
from app.services.store import get_store_settings

router = APIRouter(prefix="/admin", tags=["admin-operations"], dependencies=[Depends(current_admin)])

PAID_STATUSES = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED,
                 OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]


@router.get("/me", response_model=UserOut)
async def admin_me(admin: Admin) -> UserOut:
    return UserOut.model_validate(admin)


# ---------------------------------------------------------------- dashboard


def _allowed_transitions(order: Order) -> list[str]:
    if order.status == OrderStatus.PENDING_PAYMENT:
        return [OrderStatus.CANCELLED]
    return [str(s) for s in sorted(order_service.TRANSITIONS.get(order.status, set()))]


def _order_row(order: Order) -> AdminOrderRow:
    return AdminOrderRow(
        number=order.number, order_type=order.order_type, status=order.status, payment_status=order.payment_status,
        total_paise=order.total_paise, item_count=sum(i.quantity for i in order.items),
        customer_name=order.ship_name or order.user.full_name, email=order.email, is_gift=order.is_gift,
        created_at=order.created_at, allowed_transitions=_allowed_transitions(order),
    )


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(db: DB) -> DashboardOut:
    now = utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since = today - timedelta(days=29)
    paid = Order.payment_status == PaymentStatus.PAID

    async def money(where) -> tuple[int, int]:
        row = (await db.execute(select(func.coalesce(func.sum(Order.total_paise), 0), func.count(Order.id))
                                .where(paid, where))).one()
        return int(row[0]), int(row[1])

    revenue_today, orders_today = await money(Order.paid_at >= today)
    revenue_30d, orders_30d = await money(Order.paid_at >= since)

    day = cast(func.timezone("Asia/Kolkata", Order.paid_at), Date)
    series_rows = dict(
        ((str(d), (int(r), int(n))) for d, r, n in (
            await db.execute(select(day, func.sum(Order.total_paise), func.count(Order.id))
                             .where(paid, Order.paid_at >= since).group_by(day))
        ).all())
    )
    series = []
    for offset in range(30):
        key = str((since + timedelta(days=offset)).date())
        revenue, count = series_rows.get(key, (0, 0))
        series.append(DashboardPoint(date=key, revenue_paise=revenue, orders=count))

    top = (
        await db.execute(
            select(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"),
                   func.sum(OrderItem.line_total_paise).label("revenue"))
            .join(Order, Order.id == OrderItem.order_id)
            .where(paid, Order.paid_at >= since, OrderItem.product_id.is_not(None))
            .group_by(OrderItem.product_name).order_by(func.sum(OrderItem.quantity).desc()).limit(5)
        )
    ).all()
    low = (
        await db.execute(select(Product.id, Product.name, Product.sku, Product.stock)
                         .where(Product.is_active.is_(True), Product.stock <= 5).order_by(Product.stock).limit(10))
    ).all()
    recent = (
        await db.execute(select(Order).options(selectinload(Order.items), selectinload(Order.user))
                         .order_by(Order.created_at.desc()).limit(8))
    ).scalars().all()
    breakdown = dict((await db.execute(select(Order.status, func.count(Order.id)).group_by(Order.status))).all())

    return DashboardOut(
        revenue_today_paise=revenue_today, revenue_30d_paise=revenue_30d, orders_today=orders_today,
        orders_30d=orders_30d, avg_order_value_paise=revenue_30d // orders_30d if orders_30d else 0,
        pending_fulfilment=await db.scalar(select(func.count(Order.id)).where(
            Order.status.in_([OrderStatus.CONFIRMED, OrderStatus.PROCESSING]))) or 0,
        awaiting_payment=breakdown.get(OrderStatus.PENDING_PAYMENT, 0),
        low_stock=[{"id": i, "name": n, "sku": s, "stock": st} for i, n, s, st in low],
        new_customers_30d=await db.scalar(select(func.count(User.id)).where(
            User.created_at >= since, User.role == UserRole.CUSTOMER)) or 0,
        open_customizations=await db.scalar(select(func.count(CustomizationRequest.id)).where(
            CustomizationRequest.status.in_([CustomizationStatus.NEW, CustomizationStatus.IN_REVIEW]))) or 0,
        unread_messages=await db.scalar(select(func.count(ContactMessage.id)).where(
            ContactMessage.status == ContactMessageStatus.NEW)) or 0,
        launch_subscribers=await db.scalar(select(func.count(LaunchSubscription.id)).where(
            LaunchSubscription.unsubscribed_at.is_(None), LaunchSubscription.notified_at.is_(None))) or 0,
        wallet_liability_paise=int(await db.scalar(select(func.coalesce(func.sum(Wallet.balance_paise), 0))) or 0),
        series=series,
        top_products=[{"name": n, "quantity": int(q), "revenue_paise": int(r)} for n, q, r in top],
        recent_orders=[_order_row(o) for o in recent],
        status_breakdown={str(k): int(v) for k, v in breakdown.items()},
    )


# ------------------------------------------------------------------- orders


def _admin_order_out(order: Order) -> AdminOrderOut:
    base = order_service.order_out(order).model_dump()
    return AdminOrderOut(
        **base, id=order.id, user_id=order.user_id, admin_note=order.admin_note,
        gift_recipient_email=order.gift_recipient_email, gift_hide_prices=order.gift_hide_prices,
        payments=[{
            "provider": p.provider, "provider_order_id": p.provider_order_id,
            "provider_payment_id": p.provider_payment_id, "amount_paise": p.amount_paise, "status": p.status,
            "method": p.method, "error_description": p.error_description, "created_at": p.created_at,
        } for p in order.payments],
        allowed_transitions=_allowed_transitions(order),
    )


@router.get("/orders", response_model=Page[AdminOrderRow])
async def list_orders(
    db: DB,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status: Annotated[OrderStatus | None, Query()] = None,
    order_type: Literal["product", "gift_card"] | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Page[AdminOrderRow]:
    query = select(Order)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Order.number.ilike(pattern), Order.email.ilike(pattern),
                                Order.ship_name.ilike(pattern), Order.ship_phone.ilike(pattern)))
    if status:
        query = query.where(Order.status == status)
    if order_type:
        query = query.where(Order.order_type == order_type)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await db.execute(query.options(selectinload(Order.items), selectinload(Order.user))
                         .order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return Page[AdminOrderRow](items=[_order_row(o) for o in rows], **paginate_meta(total, page, page_size))


@router.get("/orders/{number}", response_model=AdminOrderOut)
async def get_order(number: str, db: DB) -> AdminOrderOut:
    return _admin_order_out(await order_service.get_order(db, number))


@router.post("/orders/{number}/status", response_model=AdminOrderOut)
async def change_status(number: str, body: OrderStatusIn, db: DB, admin: Admin) -> AdminOrderOut:
    order = await order_service.get_order(db, number, lock=True)
    await order_service.update_status(
        db, order, actor=admin, status=body.status, note=body.note, courier=body.courier,
        tracking_number=body.tracking_number, tracking_url=body.tracking_url, notify=body.notify_customer,
    )
    return _admin_order_out(await order_service.get_order(db, number))


@router.patch("/orders/{number}/note", response_model=AdminOrderOut)
async def order_note(number: str, body: AdminNoteIn, db: DB) -> AdminOrderOut:
    order = await order_service.get_order(db, number, lock=True)
    order.admin_note = body.admin_note
    await db.commit()
    return _admin_order_out(await order_service.get_order(db, number))


# ---------------------------------------------------------------- customers


@router.get("/customers", response_model=Page[AdminCustomerRow])
async def list_customers(
    db: DB,
    q: Annotated[str | None, Query(max_length=80)] = None,
    role: Literal["customer", "admin"] | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Page[AdminCustomerRow]:
    stats = (
        select(Order.user_id, func.count(Order.id).label("n"),
               func.coalesce(func.sum(case((Order.payment_status == PaymentStatus.PAID, Order.total_paise),
                                           else_=0)), 0).label("spent"))
        .group_by(Order.user_id).subquery()
    )
    query = (
        select(User, func.coalesce(stats.c.n, 0), func.coalesce(stats.c.spent, 0),
               func.coalesce(Wallet.balance_paise, 0))
        .outerjoin(stats, stats.c.user_id == User.id)
        .outerjoin(Wallet, Wallet.user_id == User.id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern), User.phone.ilike(pattern)))
    if role:
        query = query.where(User.role == role)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (await db.execute(query.order_by(User.created_at.desc()).offset((page - 1) * page_size)
                             .limit(page_size))).all()
    items = []
    for user, count, spent, balance in rows:
        row = AdminCustomerRow.model_validate(user)
        row.order_count, row.total_spent_paise, row.wallet_balance_paise = int(count), int(spent), int(balance)
        items.append(row)
    return Page[AdminCustomerRow](items=items, **paginate_meta(total, page, page_size))


@router.get("/customers/{user_id}")
async def get_customer(user_id: int, db: DB) -> dict:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFound("Customer not found.")
    wallet = await wallet_service.get_wallet(db, user_id)
    orders = (
        await db.execute(select(Order).where(Order.user_id == user_id).options(
            selectinload(Order.items), selectinload(Order.user)).order_by(Order.created_at.desc()).limit(50))
    ).scalars().all()
    txns = (
        await db.execute(select(WalletTransaction).where(WalletTransaction.user_id == user_id)
                         .order_by(WalletTransaction.id.desc()).limit(50))
    ).scalars().all()
    await db.commit()
    return {
        "customer": AdminCustomerRow.model_validate(user).model_copy(update={
            "order_count": len(orders), "wallet_balance_paise": wallet.balance_paise,
            "total_spent_paise": sum(o.total_paise for o in orders if o.payment_status == PaymentStatus.PAID),
        }),
        "orders": [_order_row(o) for o in orders],
        "wallet": {"balance_paise": wallet.balance_paise, "lifetime_earned_paise": wallet.lifetime_earned_paise,
                   "transactions": [WalletTxnOut.model_validate(t) for t in txns]},
    }


@router.patch("/customers/{user_id}", response_model=AdminCustomerRow)
async def update_customer(user_id: int, body: CustomerUpdateIn, db: DB, admin: Admin) -> AdminCustomerRow:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFound("Customer not found.")
    if user.id == admin.id and (body.is_active is False or body.role == UserRole.CUSTOMER):
        raise Conflict("You cannot disable or demote your own account.", code="self_lockout")
    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:
            await revoke_all_sessions(db, user.id)
    if body.role is not None and body.role != user.role:
        user.role = body.role
        await revoke_all_sessions(db, user.id)
    await db.commit()
    await db.refresh(user)
    return AdminCustomerRow.model_validate(user)


@router.post("/customers/{user_id}/wallet")
async def adjust_wallet(user_id: int, body: WalletAdjustIn, db: DB, admin: Admin) -> dict:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFound("Customer not found.")
    if body.direction == "credit":
        txn = await wallet_service.credit(db, user_id=user_id, amount_paise=body.amount_paise,
                                          reason=WalletTxnReason.ADMIN_ADJUST, note=body.note,
                                          created_by_id=admin.id)
        balance = txn.balance_after_paise if txn else 0
        if body.notify_customer:
            await enqueue_email(db, to=user.email, subject="Points added to your SPUNI Wallet",
                                template="wallet_credited",
                                context={"amount_paise": body.amount_paise, "reason": body.note,
                                         "balance_paise": balance})
    else:
        wallet = await wallet_service.get_wallet(db, user_id, lock=True)
        if wallet.balance_paise < body.amount_paise:
            raise AppError("The wallet does not have enough balance for this debit.", code="wallet_insufficient")
        await wallet_service.debit(db, user_id=user_id, amount_paise=body.amount_paise,
                                   reason=WalletTxnReason.ADMIN_ADJUST, note=body.note, created_by_id=admin.id)
        balance = wallet.balance_paise
    await db.commit()
    return {"balance_paise": balance}


# --------------------------------------------------------------- gift cards


@router.get("/gift-cards", response_model=list[AdminGiftCardOut])
async def list_gift_cards(db: DB, status: str | None = None) -> list[AdminGiftCardOut]:
    query = (select(GiftCard, Order.number, User.email).join(Order, Order.id == GiftCard.order_id)
             .join(User, User.id == GiftCard.purchaser_id))
    if status:
        query = query.where(GiftCard.status == status)
    rows = (await db.execute(query.order_by(GiftCard.created_at.desc()).limit(500))).all()
    return [AdminGiftCardOut(
        id=c.id, order_number=n, amount_paise=c.amount_paise, sender_name=c.sender_name,
        recipient_name=c.recipient_name, recipient_email=c.recipient_email, purchaser_email=e, status=c.status,
        code_last4=c.code_last4, activated_at=c.activated_at, expires_at=c.expires_at, redeemed_at=c.redeemed_at,
        created_at=c.created_at,
    ) for c, n, e in rows]


# ----------------------------------------------------------- customizations


def _customization_out(row: CustomizationRequest) -> AdminCustomizationOut:
    return AdminCustomizationOut(
        reference=row.reference, kind=row.kind, status=row.status, user_id=row.user_id,
        customer_email=row.user.email, customer_name=row.user.full_name, product_id=row.product_id,
        product_name=row.product.name if row.product else None, details=row.details,
        personalization_text=row.personalization_text, budget_paise=row.budget_paise,
        preferred_contact=row.preferred_contact, phone=row.phone, preferred_time=row.preferred_time,
        quoted_price_paise=row.quoted_price_paise, admin_notes=row.admin_notes,
        customer_visible_note=row.customer_visible_note,
        files=[{"url": f.url, "original_name": f.original_name, "content_type": f.content_type,
                "size_bytes": f.size_bytes} for f in row.files],
        created_at=row.created_at, updated_at=row.updated_at,
    )


def _customization_query():
    return select(CustomizationRequest).options(
        selectinload(CustomizationRequest.files), selectinload(CustomizationRequest.product),
        selectinload(CustomizationRequest.user),
    )


@router.get("/customizations", response_model=list[AdminCustomizationOut])
async def list_customizations(db: DB, status: CustomizationStatus | None = None) -> list[AdminCustomizationOut]:
    query = _customization_query()
    if status:
        query = query.where(CustomizationRequest.status == status)
    rows = (await db.execute(query.order_by(CustomizationRequest.created_at.desc()).limit(300))).scalars().all()
    return [_customization_out(r) for r in rows]


@router.get("/customizations/{reference}", response_model=AdminCustomizationOut)
async def get_customization(reference: str, db: DB) -> AdminCustomizationOut:
    row = (await db.execute(_customization_query().where(CustomizationRequest.reference == reference)))\
        .scalar_one_or_none()
    if row is None:
        raise NotFound("Request not found.")
    return _customization_out(row)


CUSTOMIZATION_HEADLINES = {
    CustomizationStatus.IN_REVIEW: "Our craftspeople are reviewing your idea.",
    CustomizationStatus.QUOTED: "Your quote is ready.",
    CustomizationStatus.ACCEPTED: "We're ready to begin.",
    CustomizationStatus.IN_PROGRESS: "Your piece is being crafted.",
    CustomizationStatus.COMPLETED: "Your custom piece is complete.",
    CustomizationStatus.REJECTED: "We're unable to take on this request.",
    CustomizationStatus.CANCELLED: "Your request has been closed.",
}


@router.patch("/customizations/{reference}", response_model=AdminCustomizationOut)
async def update_customization(reference: str, body: CustomizationUpdateIn, db: DB) -> AdminCustomizationOut:
    row = (await db.execute(_customization_query().where(CustomizationRequest.reference == reference)
                            .with_for_update(of=CustomizationRequest))).scalar_one_or_none()
    if row is None:
        raise NotFound("Request not found.")
    if body.status == CustomizationStatus.QUOTED and not (body.quoted_price_paise or row.quoted_price_paise):
        raise AppError("Add the quoted price before marking as quoted.", code="quote_required")
    changed_status = body.status is not None and body.status != row.status
    data = body.model_dump(exclude_unset=True, exclude={"notify_customer"})
    for field, value in data.items():
        setattr(row, field, value)
    if body.notify_customer and changed_status and row.status in CUSTOMIZATION_HEADLINES:
        await enqueue_email(
            db, to=row.user.email, subject=f"Update on your customization request · {row.reference}",
            template="customization_update",
            context={"reference": row.reference, "headline": CUSTOMIZATION_HEADLINES[row.status],
                     "quoted_price_paise": row.quoted_price_paise if row.status == CustomizationStatus.QUOTED
                     else None, "note": row.customer_visible_note},
        )
    await db.commit()
    # Commit expires the loaded row; reload it (with relations) before serialising.
    row = (await db.execute(_customization_query().where(CustomizationRequest.reference == reference)
                            .execution_options(populate_existing=True))).scalar_one()
    return _customization_out(row)


# ----------------------------------------------------------------- messages


@router.get("/messages", response_model=list[ContactMessageOut])
async def list_messages(db: DB, status: Literal["new", "read", "closed"] | None = None) -> list[ContactMessageOut]:
    query = select(ContactMessage)
    if status:
        query = query.where(ContactMessage.status == status)
    rows = (await db.execute(query.order_by(ContactMessage.created_at.desc()).limit(300))).scalars().all()
    return [ContactMessageOut.model_validate(r) for r in rows]


@router.patch("/messages/{message_id}", response_model=ContactMessageOut)
async def update_message(message_id: int, body: ContactStatusIn, db: DB) -> ContactMessageOut:
    row = await db.get(ContactMessage, message_id)
    if row is None:
        raise NotFound("Message not found.")
    row.status = body.status
    await db.commit()
    await db.refresh(row)
    return ContactMessageOut.model_validate(row)


# --------------------------------------------------------------- email log


@router.get("/emails", response_model=Page[EmailLogOut])
async def email_log(
    db: DB,
    status: Literal["pending", "sending", "sent", "failed"] | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Page[EmailLogOut]:
    query = select(EmailOutbox)
    if status:
        query = query.where(EmailOutbox.status == status)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (await db.execute(query.order_by(EmailOutbox.id.desc()).offset((page - 1) * page_size)
                             .limit(page_size))).scalars().all()
    return Page[EmailLogOut](items=[EmailLogOut.model_validate(r) for r in rows],
                             **paginate_meta(total, page, page_size))


@router.post("/emails/{email_id}/retry", response_model=EmailLogOut)
async def retry_email(email_id: int, db: DB) -> EmailLogOut:
    row = await db.get(EmailOutbox, email_id)
    if row is None:
        raise NotFound("Email not found.")
    if row.status != EmailStatus.FAILED:
        raise Conflict("Only failed emails can be retried.", code="not_failed")
    if any(v == "[redacted]" for v in row.context.values()):
        raise Conflict("This email contained a one-time secret and cannot be resent.", code="not_resendable")
    row.status, row.attempts, row.send_after = EmailStatus.PENDING, 0, utcnow()
    await db.commit()
    await db.refresh(row)
    return EmailLogOut.model_validate(row)


# ----------------------------------------------------------------- settings


@router.get("/settings", response_model=StoreSettingsOut)
async def get_settings(db: DB) -> StoreSettingsOut:
    row = await get_store_settings(db)
    await db.commit()
    return StoreSettingsOut.model_validate(row)


@router.put("/settings", response_model=StoreSettingsOut)
async def update_settings(body: StoreSettingsIn, db: DB) -> StoreSettingsOut:
    row = await get_store_settings(db, for_update=True)
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return StoreSettingsOut.model_validate(row)



