"""Catalog queries and serializers shared by storefront and admin."""

from typing import Literal

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFound
from app.models import Category, Launch, LaunchSubscription, Product
from app.models.enums import LaunchStatus
from app.schemas.catalog import (
    CategoryOut,
    CategoryRef,
    ImageOut,
    LaunchOut,
    MenuCategory,
    MenuProduct,
    ProductCard,
    ProductDetail,
)

LOW_STOCK = 5
SortKey = Literal["featured", "newest", "price_asc", "price_desc", "name"]


def product_card(product: Product) -> ProductCard:
    images = product.images
    return ProductCard(
        id=product.id,
        name=product.name,
        slug=product.slug,
        short_description=product.short_description,
        price_paise=product.price_paise,
        compare_at_price_paise=product.compare_at_price_paise,
        badge=product.badge,
        image_url=images[0].url if images else None,
        hover_image_url=images[1].url if len(images) > 1 else None,
        in_stock=product.stock > 0,
        is_customizable=product.is_customizable,
        gender=product.gender,
        category=CategoryRef(id=product.category.id, name=product.category.name, slug=product.category.slug),
    )


def product_detail(product: Product, related: list[Product]) -> ProductDetail:
    card = product_card(product)
    if product.stock <= 0:
        stock_status = "out_of_stock"
    elif product.stock <= LOW_STOCK:
        stock_status = "low_stock"
    else:
        stock_status = "in_stock"
    return ProductDetail(
        **card.model_dump(),
        sku=product.sku,
        description=product.description,
        stock_status=stock_status,
        available_quantity=min(product.stock, 10),
        material=product.material,
        color=product.color,
        dimensions=product.dimensions,
        weight_grams=product.weight_grams,
        care_instructions=product.care_instructions,
        images=[ImageOut.model_validate(img) for img in product.images],
        meta_title=product.meta_title,
        meta_description=product.meta_description,
        related=[product_card(p) for p in related],
    )


def _active_products() -> Select:
    return (
        select(Product)
        .join(Product.category)
        .where(Product.is_active.is_(True), Category.is_active.is_(True))
        .options(selectinload(Product.images), selectinload(Product.category))
    )


def _apply_sort(query: Select, sort: SortKey) -> Select:
    match sort:
        case "newest":
            return query.order_by(Product.created_at.desc(), Product.id.desc())
        case "price_asc":
            return query.order_by(Product.price_paise.asc(), Product.id)
        case "price_desc":
            return query.order_by(Product.price_paise.desc(), Product.id)
        case "name":
            return query.order_by(Product.name.asc())
        case _:
            return query.order_by(
                Product.is_featured.desc(), Product.is_bestseller.desc(), Product.sort_order, Product.id
            )


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_products(
    db: AsyncSession,
    *,
    category: str | None = None,
    gender: str | None = None,
    q: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    in_stock: bool | None = None,
    customizable: bool | None = None,
    ids: list[int] | None = None,
    sort: SortKey = "featured",
    page: int = 1,
    page_size: int = 24,
) -> tuple[list[Product], int]:
    query = _active_products()
    if category:
        query = query.where(Category.slug == category)
    if gender:
        query = query.where(or_(Product.gender == gender, Product.gender == "unisex"))
    if q:
        pattern = f"%{_escape_like(q)}%"
        query = query.where(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.short_description.ilike(pattern, escape="\\"),
                Product.material.ilike(pattern, escape="\\"),
                Product.color.ilike(pattern, escape="\\"),
                Category.name.ilike(pattern, escape="\\"),
            )
        )
    if min_price is not None:
        query = query.where(Product.price_paise >= min_price)
    if max_price is not None:
        query = query.where(Product.price_paise <= max_price)
    if in_stock:
        query = query.where(Product.stock > 0)
    if customizable:
        query = query.where(Product.is_customizable.is_(True))
    if ids:
        query = query.where(Product.id.in_(ids))

    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = (
        await db.execute(_apply_sort(query, sort).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return list(rows), total


async def flagged_products(db: AsyncSession, flag: Literal["bestseller", "featured"], limit: int = 12) -> list[Product]:
    column = Product.is_bestseller if flag == "bestseller" else Product.is_featured
    rows = await db.execute(
        _active_products().where(column.is_(True)).order_by(Product.sort_order, Product.id).limit(limit)
    )
    return list(rows.scalars().all())


async def get_product_by_slug(db: AsyncSession, slug: str) -> tuple[Product, list[Product]]:
    product = (await db.execute(_active_products().where(Product.slug == slug))).scalar_one_or_none()
    if product is None:
        raise NotFound("We couldn't find that product.")
    related = (
        await db.execute(
            _active_products()
            .where(Product.category_id == product.category_id, Product.id != product.id)
            .order_by(Product.is_bestseller.desc(), Product.sort_order)
            .limit(8)
        )
    ).scalars().all()
    if len(related) < 4:
        extra = (
            await db.execute(
                _active_products()
                .where(Product.category_id != product.category_id, Product.is_bestseller.is_(True))
                .limit(4 - len(related))
            )
        ).scalars().all()
        related = [*related, *extra]
    return product, list(related)


async def list_categories(db: AsyncSession) -> list[CategoryOut]:
    counts = (
        select(Product.category_id, func.count(Product.id).label("n"))
        .where(Product.is_active.is_(True))
        .group_by(Product.category_id)
        .subquery()
    )
    rows = await db.execute(
        select(Category, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.category_id == Category.id)
        .where(Category.is_active.is_(True))
        .order_by(Category.sort_order, Category.name)
    )
    result = []
    for category, count in rows.all():
        out = CategoryOut.model_validate(category)
        out.product_count = int(count)
        result.append(out)
    return result


async def get_category(db: AsyncSession, slug: str) -> CategoryOut:
    for category in await list_categories(db):
        if category.slug == slug:
            return category
    raise NotFound("We couldn't find that category.")


async def build_menu(db: AsyncSession) -> list[MenuCategory]:
    categories = (
        await db.execute(
            select(Category)
            .where(Category.is_active.is_(True), Category.show_in_menu.is_(True))
            .order_by(Category.sort_order, Category.name)
        )
    ).scalars().all()
    products = (
        await db.execute(
            select(Product.category_id, Product.name, Product.slug, Product.gender)
            .where(Product.is_active.is_(True))
            .order_by(Product.is_bestseller.desc(), Product.sort_order, Product.name)
        )
    ).all()
    by_category: dict[int, list[MenuProduct]] = {}
    for category_id, name, slug, gender in products:
        bucket = by_category.setdefault(category_id, [])
        if len(bucket) < 12:
            bucket.append(MenuProduct(name=name, slug=slug, gender=gender))
    return [
        MenuCategory(
            name=c.name, slug=c.slug, image_url=c.image_url, tagline=c.tagline,
            products=by_category.get(c.id, []),
        )
        for c in categories
    ]


async def visible_launches(db: AsyncSession, limit: int = 12) -> list[LaunchOut]:
    subs = (
        select(LaunchSubscription.launch_id, func.count(LaunchSubscription.id).label("n"))
        .where(LaunchSubscription.unsubscribed_at.is_(None))
        .group_by(LaunchSubscription.launch_id)
        .subquery()
    )
    rows = await db.execute(
        select(Launch, func.coalesce(subs.c.n, 0))
        .outerjoin(subs, subs.c.launch_id == Launch.id)
        .where(Launch.status.in_([LaunchStatus.UPCOMING, LaunchStatus.LAUNCHED]))
        .options(selectinload(Launch.category), selectinload(Launch.product))
        .order_by(
            and_(Launch.status == LaunchStatus.LAUNCHED).asc(),
            Launch.sort_order,
            Launch.launch_at.asc().nulls_last(),
        )
        .limit(limit)
    )
    return [launch_out(launch, int(count)) for launch, count in rows.all()]


def launch_out(launch: Launch, subscriber_count: int = 0) -> LaunchOut:
    return LaunchOut(
        id=launch.id,
        title=launch.title,
        slug=launch.slug,
        tagline=launch.tagline,
        description=launch.description,
        image_url=launch.image_url,
        launch_at=launch.launch_at,
        status=launch.status,
        category=CategoryRef(id=launch.category.id, name=launch.category.name, slug=launch.category.slug)
        if launch.category
        else None,
        product_slug=launch.product.slug if launch.product and launch.product.is_active else None,
        subscriber_count=subscriber_count,
    )
