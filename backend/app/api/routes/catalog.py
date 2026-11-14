"""Public storefront catalog endpoints."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, OptionalCustomer
from app.core.config import settings
from app.core.errors import AppError
from app.core.ratelimit import rate_limit
from app.models import Banner, Launch
from app.models.enums import LaunchStatus
from app.schemas.catalog import (
    BannerOut,
    CategoryOut,
    HomeOut,
    LaunchOut,
    LaunchSubscribeIn,
    LaunchSubscribeOut,
    MenuOut,
    ProductCard,
    ProductDetail,
)
from app.schemas.common import Message, Page, paginate_meta
from app.schemas.engagement import StoreInfoOut
from app.services import catalog as catalog_service
from app.services import launches as launch_service
from app.services.store import get_store_settings

router = APIRouter(tags=["catalog"])

SlugPath = Annotated[str, Query(min_length=1, max_length=140, pattern=r"^[a-z0-9-]+$")]


@router.get("/home", response_model=HomeOut)
async def home(db: DB) -> HomeOut:
    banners = (
        await db.execute(select(Banner).where(Banner.is_active.is_(True)).order_by(Banner.sort_order, Banner.id))
    ).scalars().all()
    return HomeOut(
        banners=[BannerOut.model_validate(b) for b in banners],
        launches=await catalog_service.visible_launches(db, limit=8),
        bestsellers=[catalog_service.product_card(p) for p in await catalog_service.flagged_products(db, "bestseller")],
        featured=[catalog_service.product_card(p) for p in await catalog_service.flagged_products(db, "featured", 8)],
        categories=await catalog_service.list_categories(db),
    )


@router.get("/store", response_model=StoreInfoOut)
async def store_info(db: DB) -> StoreInfoOut:
    store = await get_store_settings(db)
    return StoreInfoOut(
        support_email=store.support_email, support_phone=store.support_phone,
        shipping_flat_paise=store.shipping_flat_paise,
        free_shipping_threshold_paise=store.free_shipping_threshold_paise,
        gift_wrap_paise=store.gift_wrap_paise, wallet_max_redeem_percent=store.wallet_max_redeem_percent,
        wallet_cash_value_paise=store.wallet_cash_value_paise,
        wallet_tier_1_limit_paise=store.wallet_tier_1_limit_paise,
        wallet_tier_2_limit_paise=store.wallet_tier_2_limit_paise,
        wallet_tier_3_limit_paise=store.wallet_tier_3_limit_paise,
        wallet_tier_1_percent=store.wallet_tier_1_percent,
        wallet_tier_2_percent=store.wallet_tier_2_percent,
        wallet_tier_3_percent=store.wallet_tier_3_percent,
        wallet_tier_4_percent=store.wallet_tier_4_percent, payment_mode=settings.payment_mode,
        razorpay_key_id=settings.razorpay_key_id or None,
    )


@router.get("/menu", response_model=MenuOut)
async def menu(db: DB) -> MenuOut:
    featured = await catalog_service.flagged_products(db, "featured", 4)
    return MenuOut(categories=await catalog_service.build_menu(db),
                   featured=[catalog_service.product_card(p) for p in featured])


@router.get("/categories", response_model=list[CategoryOut])
async def categories(db: DB) -> list[CategoryOut]:
    return await catalog_service.list_categories(db)


@router.get("/categories/{slug}", response_model=CategoryOut)
async def category(slug: str, db: DB) -> CategoryOut:
    return await catalog_service.get_category(db, slug)


@router.get("/products", response_model=Page[ProductCard])
async def products(
    db: DB,
    category: Annotated[str | None, Query(max_length=90, pattern=r"^[a-z0-9-]+$")] = None,
    gender: Annotated[Literal["men", "women", "unisex"] | None, Query()] = None,
    q: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    min_price: Annotated[int | None, Query(ge=0, le=100_000_000)] = None,
    max_price: Annotated[int | None, Query(ge=0, le=100_000_000)] = None,
    in_stock: bool | None = None,
    customizable: bool | None = None,
    ids: Annotated[str | None, Query(max_length=600, pattern=r"^\d+(,\d+){0,59}$",
                                     description="Comma-separated product ids")] = None,
    sort: Literal["featured", "newest", "price_asc", "price_desc", "name"] = "featured",
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 24,
) -> Page[ProductCard]:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise AppError("Minimum price cannot exceed maximum price.", code="invalid_price_range")
    rows, total = await catalog_service.list_products(
        db, category=category, gender=gender, q=q.strip() if q else None, min_price=min_price,
        max_price=max_price, in_stock=in_stock, customizable=customizable,
        ids=[int(i) for i in ids.split(",")] if ids else None, sort=sort, page=page,
        page_size=page_size,
    )
    return Page[ProductCard](items=[catalog_service.product_card(p) for p in rows],
                             **paginate_meta(total, page, page_size))


@router.get("/products/{slug}", response_model=ProductDetail)
async def product(slug: str, db: DB) -> ProductDetail:
    item, related = await catalog_service.get_product_by_slug(db, slug)
    return catalog_service.product_detail(item, related)


@router.get("/launches", response_model=list[LaunchOut])
async def launches(db: DB) -> list[LaunchOut]:
    return await catalog_service.visible_launches(db, limit=24)


@router.get("/launches/{slug}", response_model=LaunchOut)
async def launch(slug: str, db: DB) -> LaunchOut:
    row = (
        await db.execute(
            select(Launch)
            .where(Launch.slug == slug, Launch.status.in_([LaunchStatus.UPCOMING, LaunchStatus.LAUNCHED]))
            .options(selectinload(Launch.category), selectinload(Launch.product))
        )
    ).scalar_one_or_none()
    if row is None:
        from app.core.errors import NotFound

        raise NotFound("This launch is not available.")
    return catalog_service.launch_out(row)


@router.post("/launches/{slug}/notify", response_model=LaunchSubscribeOut,
             dependencies=[Depends(rate_limit("launch-notify", 12, 600))])
async def notify_me(slug: str, body: LaunchSubscribeIn, db: DB, user: OptionalCustomer) -> LaunchSubscribeOut:
    email = user.email if user else body.email
    if not email:
        raise AppError("Enter your email to get notified.", code="email_required")
    created = await launch_service.subscribe(db, slug=slug, email=email, user=user)
    return LaunchSubscribeOut(
        subscribed=True,
        message="You're on the list. We'll email you the moment it launches." if created
        else "You're already on the list for this launch.",
    )


@router.post("/launches/unsubscribe", response_model=Message,
             dependencies=[Depends(rate_limit("unsubscribe", 20, 600))])
async def unsubscribe(db: DB, token: Annotated[str, Query(min_length=16, max_length=64)]) -> Message:
    await launch_service.unsubscribe(db, token)
    return Message(message="You will no longer receive launch notifications for this item.")
