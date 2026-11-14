"""Customer account: addresses, wishlist, wallet, gift cards."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Customer
from app.core.errors import AppError, NotFound
from app.core.ratelimit import rate_limit
from app.models import Address, GiftCard, Order, Product, WalletTransaction, WishlistItem
from app.schemas.account import AddressIn, AddressOut
from app.schemas.catalog import ProductCard
from app.schemas.orders import PaymentInitOut
from app.schemas.wallet import (
    GiftCardOut,
    GiftCardPurchaseIn,
    GiftCardRedeemIn,
    GiftConfigOut,
    WalletOut,
    WalletTxnOut,
)
from app.services import catalog as catalog_service
from app.services import gifts as gift_service
from app.services import orders as order_service
from app.services import wallet as wallet_service
from app.services.store import get_store_settings

router = APIRouter(prefix="/account", tags=["account"])
public_router = APIRouter(tags=["gifts"])

MAX_ADDRESSES = 10


# ---------------------------------------------------------------- addresses


@router.get("/addresses", response_model=list[AddressOut])
async def list_addresses(db: DB, user: Customer) -> list[AddressOut]:
    rows = (
        await db.execute(select(Address).where(Address.user_id == user.id)
                         .order_by(Address.is_default.desc(), Address.id))
    ).scalars().all()
    return [AddressOut.model_validate(a) for a in rows]


async def _clear_default(db: DB, user_id: int) -> None:
    await db.execute(update(Address).where(Address.user_id == user_id).values(is_default=False))


@router.post("/addresses", response_model=AddressOut, status_code=201)
async def create_address(body: AddressIn, db: DB, user: Customer) -> AddressOut:
    existing = (await db.execute(select(Address.id).where(Address.user_id == user.id))).scalars().all()
    if len(existing) >= MAX_ADDRESSES:
        raise AppError(f"You can save up to {MAX_ADDRESSES} addresses.", code="address_limit")
    make_default = body.is_default or not existing
    if make_default:
        await _clear_default(db, user.id)
    address = Address(user_id=user.id, **body.model_dump(exclude={"is_default"}), is_default=make_default)
    db.add(address)
    await db.commit()
    await db.refresh(address)
    return AddressOut.model_validate(address)


async def _own_address(db: DB, user_id: int, address_id: int) -> Address:
    address = await db.get(Address, address_id)
    if address is None or address.user_id != user_id:
        raise NotFound("Address not found.")
    return address


@router.put("/addresses/{address_id}", response_model=AddressOut)
async def update_address(address_id: int, body: AddressIn, db: DB, user: Customer) -> AddressOut:
    address = await _own_address(db, user.id, address_id)
    if body.is_default and not address.is_default:
        await _clear_default(db, user.id)
    for field, value in body.model_dump(exclude={"is_default"}).items():
        setattr(address, field, value)
    if body.is_default:
        address.is_default = True
    await db.commit()
    await db.refresh(address)
    return AddressOut.model_validate(address)


@router.delete("/addresses/{address_id}", status_code=204)
async def delete_address(address_id: int, db: DB, user: Customer) -> Response:
    address = await _own_address(db, user.id, address_id)
    was_default = address.is_default
    await db.delete(address)
    await db.flush()
    if was_default:
        replacement = (
            await db.execute(select(Address).where(Address.user_id == user.id).order_by(Address.id).limit(1))
        ).scalar_one_or_none()
        if replacement:
            replacement.is_default = True
    await db.commit()
    return Response(status_code=204)


# ----------------------------------------------------------------- wishlist


@router.get("/wishlist", response_model=list[ProductCard])
async def wishlist(db: DB, user: Customer) -> list[ProductCard]:
    rows = (
        await db.execute(
            select(Product)
            .join(WishlistItem, WishlistItem.product_id == Product.id)
            .where(WishlistItem.user_id == user.id, Product.is_active.is_(True))
            .options(selectinload(Product.images), selectinload(Product.category))
            .order_by(WishlistItem.created_at.desc())
        )
    ).scalars().all()
    return [catalog_service.product_card(p) for p in rows]


@router.put("/wishlist/{product_id}", status_code=204)
async def add_wishlist(product_id: int, db: DB, user: Customer) -> Response:
    product = await db.get(Product, product_id)
    if product is None or not product.is_active:
        raise NotFound("Product not found.")
    count = len((await db.execute(select(WishlistItem.id).where(WishlistItem.user_id == user.id))).all())
    if count >= 200:
        raise AppError("Your wishlist is full.", code="wishlist_full")
    await db.execute(insert(WishlistItem).values(user_id=user.id, product_id=product_id).on_conflict_do_nothing())
    await db.commit()
    return Response(status_code=204)


@router.delete("/wishlist/{product_id}", status_code=204)
async def remove_wishlist(product_id: int, db: DB, user: Customer) -> Response:
    await db.execute(delete(WishlistItem).where(WishlistItem.user_id == user.id,
                                                WishlistItem.product_id == product_id))
    await db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------- wallet


@router.get("/wallet", response_model=WalletOut)
async def wallet(db: DB, user: Customer) -> WalletOut:
    store = await get_store_settings(db)
    wallet_row = await wallet_service.get_wallet(db, user.id)
    rows = (
        await db.execute(
            select(WalletTransaction, Order.number)
            .outerjoin(Order, Order.id == WalletTransaction.order_id)
            .where(WalletTransaction.user_id == user.id)
            .order_by(WalletTransaction.created_at.desc(), WalletTransaction.id.desc())
            .limit(100)
        )
    ).all()
    await db.commit()
    txns = []
    for txn, number in rows:
        out = WalletTxnOut.model_validate(txn)
        out.order_number = number
        txns.append(out)
    return WalletOut(balance_paise=wallet_row.balance_paise, lifetime_earned_paise=wallet_row.lifetime_earned_paise,
                     max_redeem_percent=store.wallet_max_redeem_percent, transactions=txns)


@router.post("/wallet/redeem", response_model=GiftCardOut,
             dependencies=[Depends(rate_limit("gift-redeem", 10, 900))])
async def redeem(body: GiftCardRedeemIn, db: DB, user: Customer) -> GiftCardOut:
    card = await gift_service.redeem_gift_card(db, user, body.code)
    return GiftCardOut.model_validate(card)


# --------------------------------------------------------------- gift cards


@public_router.get("/gift-cards/config", response_model=GiftConfigOut)
async def gift_config(db: DB) -> GiftConfigOut:
    store = await get_store_settings(db)
    presets = [p for p in (100000, 250000, 500000, 1000000)
               if store.gift_card_min_paise <= p <= store.gift_card_max_paise]
    await db.commit()
    return GiftConfigOut(min_paise=store.gift_card_min_paise, max_paise=store.gift_card_max_paise,
                         presets_paise=presets, validity_days=store.gift_card_validity_days,
                         gift_wrap_paise=store.gift_wrap_paise)


@router.post("/gift-cards", response_model=PaymentInitOut,
             dependencies=[Depends(rate_limit("gift-buy", 10, 600))])
async def buy_gift_card(body: GiftCardPurchaseIn, db: DB, user: Customer) -> PaymentInitOut:
    return await order_service.create_gift_card_order(db, user, body)


@router.get("/gift-cards", response_model=list[GiftCardOut])
async def my_gift_cards(db: DB, user: Customer) -> list[GiftCardOut]:
    rows = (
        await db.execute(
            select(GiftCard, Order.number).join(Order, Order.id == GiftCard.order_id)
            .where(GiftCard.purchaser_id == user.id).order_by(GiftCard.created_at.desc()).limit(100)
        )
    ).all()
    result = []
    for card, number in rows:
        out = GiftCardOut.model_validate(card)
        out.order_number = number
        result.append(out)
    return result
