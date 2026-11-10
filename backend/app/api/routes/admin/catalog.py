"""Admin: categories, products, media, hero banners and launches."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Admin, current_admin
from app.core.errors import AppError, Conflict, NotFound
from app.models import Banner, Category, Launch, LaunchSubscription, OrderItem, Product, ProductImage
from app.schemas.admin import (
    AdminBannerOut,
    AdminCategoryOut,
    AdminLaunchOut,
    AdminProductOut,
    BannerIn,
    CategoryIn,
    LaunchIn,
    LaunchNotifyIn,
    LaunchNotifyOut,
    LaunchSubscriberOut,
    ProductIn,
    StockAdjustIn,
)
from app.schemas.common import Page, paginate_meta
from app.services import launches as launch_service
from app.services import media

router = APIRouter(prefix="/admin", tags=["admin-catalog"], dependencies=[Depends(current_admin)])

MediaFolder = Literal["products", "categories", "launches", "banners"]


# -------------------------------------------------------------------- media


@router.post("/media/{folder}", status_code=201)
async def upload_media(folder: MediaFolder, file: Annotated[UploadFile, File()]) -> dict[str, str | int]:
    stored = await media.save_image(file, folder)
    return {"url": stored.url, "size_bytes": stored.size_bytes}


# --------------------------------------------------------------- categories


async def _category_out(db: DB, category: Category) -> AdminCategoryOut:
    out = AdminCategoryOut.model_validate(category)
    out.product_count = await db.scalar(select(func.count(Product.id)).where(Product.category_id == category.id)) or 0
    return out


@router.get("/categories", response_model=list[AdminCategoryOut])
async def list_categories(db: DB) -> list[AdminCategoryOut]:
    counts = dict(
        (await db.execute(select(Product.category_id, func.count(Product.id)).group_by(Product.category_id))).all()
    )
    rows = (await db.execute(select(Category).order_by(Category.sort_order, Category.name))).scalars().all()
    result = []
    for c in rows:
        out = AdminCategoryOut.model_validate(c)
        out.product_count = counts.get(c.id, 0)
        result.append(out)
    return result


async def _check_category_unique(db: DB, body: CategoryIn, exclude_id: int | None = None) -> None:
    query = select(Category.id).where(or_(Category.slug == body.slug, func.lower(Category.name) == body.name.lower()))
    if exclude_id:
        query = query.where(Category.id != exclude_id)
    if await db.scalar(query):
        raise Conflict("A category with this name or slug already exists.", code="duplicate_category")


@router.post("/categories", response_model=AdminCategoryOut, status_code=201)
async def create_category(body: CategoryIn, db: DB) -> AdminCategoryOut:
    await _check_category_unique(db, body)
    category = Category(**body.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return await _category_out(db, category)


@router.put("/categories/{category_id}", response_model=AdminCategoryOut)
async def update_category(category_id: int, body: CategoryIn, db: DB) -> AdminCategoryOut:
    category = await db.get(Category, category_id)
    if category is None:
        raise NotFound("Category not found.")
    await _check_category_unique(db, body, exclude_id=category_id)
    for field, value in body.model_dump().items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return await _category_out(db, category)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: int, db: DB) -> Response:
    category = await db.get(Category, category_id)
    if category is None:
        raise NotFound("Category not found.")
    if await db.scalar(select(func.count(Product.id)).where(Product.category_id == category_id)):
        raise Conflict("Move or delete this category's products first, or hide the category instead.",
                       code="category_in_use")
    await db.delete(category)
    await db.commit()
    return Response(status_code=204)


# ----------------------------------------------------------------- products


def _product_out(product: Product) -> AdminProductOut:
    data = {c: getattr(product, c) for c in AdminProductOut.model_fields if hasattr(product, c)
            and c not in ("images", "category_name")}
    return AdminProductOut(**data, category_name=product.category.name,
                           images=[{"id": i.id, "url": i.url, "alt": i.alt, "sort_order": i.sort_order}
                                   for i in product.images])


async def _load_product(db: DB, product_id: int) -> Product:
    product = (
        await db.execute(select(Product).where(Product.id == product_id)
                         .options(selectinload(Product.images), selectinload(Product.category)))
    ).scalar_one_or_none()
    if product is None:
        raise NotFound("Product not found.")
    return product


@router.get("/products", response_model=Page[AdminProductOut])
async def list_products(
    db: DB,
    q: Annotated[str | None, Query(max_length=80)] = None,
    category_id: Annotated[int | None, Query(gt=0)] = None,
    status: Literal["all", "active", "inactive", "low_stock", "out_of_stock"] = "all",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Page[AdminProductOut]:
    query = select(Product).options(selectinload(Product.images), selectinload(Product.category))
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.sku.ilike(pattern), Product.slug.ilike(pattern)))
    if category_id:
        query = query.where(Product.category_id == category_id)
    if status == "active":
        query = query.where(Product.is_active.is_(True))
    elif status == "inactive":
        query = query.where(Product.is_active.is_(False))
    elif status == "low_stock":
        query = query.where(Product.stock.between(1, 5))
    elif status == "out_of_stock":
        query = query.where(Product.stock == 0)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await db.execute(query.order_by(Product.sort_order, Product.id.desc())
                         .offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return Page[AdminProductOut](items=[_product_out(p) for p in rows], **paginate_meta(total, page, page_size))


@router.get("/products/{product_id}", response_model=AdminProductOut)
async def get_product(product_id: int, db: DB) -> AdminProductOut:
    return _product_out(await _load_product(db, product_id))


async def _validate_product(db: DB, body: ProductIn, exclude_id: int | None = None) -> None:
    if await db.get(Category, body.category_id) is None:
        raise AppError("Choose a valid category.", code="invalid_category")
    query = select(Product.id).where(or_(Product.slug == body.slug, Product.sku == body.sku))
    if exclude_id:
        query = query.where(Product.id != exclude_id)
    if await db.scalar(query):
        raise Conflict("Another product already uses this slug or SKU.", code="duplicate_product")


def _apply_images(product: Product, body: ProductIn) -> list[str]:
    """Sync images with the payload; returns URLs to delete after commit."""
    keep = {img.url for img in body.images}
    removed = []
    for existing in list(product.images):
        if existing.url not in keep:
            product.images.remove(existing)
            removed.append(existing.url)
    by_url = {img.url: img for img in product.images}
    for index, image in enumerate(body.images):
        row = by_url.get(image.url)
        if row is None:
            product.images.append(ProductImage(url=image.url, alt=image.alt, sort_order=index))
        else:
            row.alt, row.sort_order = image.alt, index
    return removed


@router.post("/products", response_model=AdminProductOut, status_code=201)
async def create_product(body: ProductIn, db: DB) -> AdminProductOut:
    await _validate_product(db, body)
    product = Product(**body.model_dump(exclude={"images"}), images=[])
    _apply_images(product, body)
    db.add(product)
    await db.commit()
    return _product_out(await _load_product(db, product.id))


@router.put("/products/{product_id}", response_model=AdminProductOut)
async def update_product(product_id: int, body: ProductIn, db: DB) -> AdminProductOut:
    product = await _load_product(db, product_id)
    await _validate_product(db, body, exclude_id=product_id)
    for field, value in body.model_dump(exclude={"images"}).items():
        setattr(product, field, value)
    removed = _apply_images(product, body)
    await db.commit()
    for url in removed:
        media.delete_media(url)
    db.expunge(product)
    return _product_out(await _load_product(db, product_id))


@router.patch("/products/{product_id}/stock", response_model=AdminProductOut)
async def set_stock(product_id: int, body: StockAdjustIn, db: DB) -> AdminProductOut:
    product = (await db.execute(select(Product).where(Product.id == product_id).with_for_update())).scalar_one_or_none()
    if product is None:
        raise NotFound("Product not found.")
    product.stock = body.stock
    await db.commit()
    db.expunge(product)
    return _product_out(await _load_product(db, product_id))


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: int, db: DB) -> Response:
    product = await _load_product(db, product_id)
    if await db.scalar(select(func.count(OrderItem.id)).where(OrderItem.product_id == product_id)):
        # Keep order history intact: archive instead of deleting.
        product.is_active = False
        await db.commit()
        return Response(status_code=204)
    urls = [image.url for image in product.images]
    await db.delete(product)
    await db.commit()
    for url in urls:
        media.delete_media(url)
    return Response(status_code=204)


# ------------------------------------------------------------------ banners


@router.get("/banners", response_model=list[AdminBannerOut])
async def list_banners(db: DB) -> list[AdminBannerOut]:
    rows = (await db.execute(select(Banner).order_by(Banner.sort_order, Banner.id))).scalars().all()
    return [AdminBannerOut.model_validate(b) for b in rows]


@router.post("/banners", response_model=AdminBannerOut, status_code=201)
async def create_banner(body: BannerIn, db: DB) -> AdminBannerOut:
    banner = Banner(**body.model_dump())
    db.add(banner)
    await db.commit()
    await db.refresh(banner)
    return AdminBannerOut.model_validate(banner)


@router.put("/banners/{banner_id}", response_model=AdminBannerOut)
async def update_banner(banner_id: int, body: BannerIn, db: DB) -> AdminBannerOut:
    banner = await db.get(Banner, banner_id)
    if banner is None:
        raise NotFound("Banner not found.")
    old_image = banner.image_url
    for field, value in body.model_dump().items():
        setattr(banner, field, value)
    await db.commit()
    if old_image != body.image_url:
        media.delete_media(old_image)
    await db.refresh(banner)
    return AdminBannerOut.model_validate(banner)


@router.delete("/banners/{banner_id}", status_code=204)
async def delete_banner(banner_id: int, db: DB) -> Response:
    banner = await db.get(Banner, banner_id)
    if banner is None:
        raise NotFound("Banner not found.")
    image = banner.image_url
    await db.delete(banner)
    await db.commit()
    media.delete_media(image)
    return Response(status_code=204)


# ----------------------------------------------------------------- launches


async def _launch_out(db: DB, launch: Launch) -> AdminLaunchOut:
    out = AdminLaunchOut.model_validate(launch)
    base = select(func.count(LaunchSubscription.id)).where(LaunchSubscription.launch_id == launch.id,
                                                           LaunchSubscription.unsubscribed_at.is_(None))
    out.subscriber_count = await db.scalar(base) or 0
    out.pending_count = await db.scalar(base.where(LaunchSubscription.notified_at.is_(None))) or 0
    return out


async def _validate_launch(db: DB, body: LaunchIn, exclude_id: int | None = None) -> None:
    query = select(Launch.id).where(Launch.slug == body.slug)
    if exclude_id:
        query = query.where(Launch.id != exclude_id)
    if await db.scalar(query):
        raise Conflict("Another launch already uses this slug.", code="duplicate_launch")
    if body.category_id and await db.get(Category, body.category_id) is None:
        raise AppError("Choose a valid category.", code="invalid_category")
    if body.product_id and await db.get(Product, body.product_id) is None:
        raise AppError("Choose a valid product.", code="invalid_product")


@router.get("/launches", response_model=list[AdminLaunchOut])
async def list_launches(db: DB) -> list[AdminLaunchOut]:
    rows = (await db.execute(select(Launch).order_by(Launch.sort_order, Launch.launch_at.desc().nulls_last())))\
        .scalars().all()
    return [await _launch_out(db, launch) for launch in rows]


@router.post("/launches", response_model=AdminLaunchOut, status_code=201)
async def create_launch(body: LaunchIn, db: DB) -> AdminLaunchOut:
    await _validate_launch(db, body)
    launch = Launch(**body.model_dump())
    db.add(launch)
    await db.commit()
    await db.refresh(launch)
    return await _launch_out(db, launch)


@router.put("/launches/{launch_id}", response_model=AdminLaunchOut)
async def update_launch(launch_id: int, body: LaunchIn, db: DB) -> AdminLaunchOut:
    launch = await db.get(Launch, launch_id)
    if launch is None:
        raise NotFound("Launch not found.")
    await _validate_launch(db, body, exclude_id=launch_id)
    for field, value in body.model_dump().items():
        setattr(launch, field, value)
    await db.commit()
    await db.refresh(launch)
    return await _launch_out(db, launch)


@router.delete("/launches/{launch_id}", status_code=204)
async def delete_launch(launch_id: int, db: DB) -> Response:
    launch = await db.get(Launch, launch_id)
    if launch is None:
        raise NotFound("Launch not found.")
    await db.delete(launch)
    await db.commit()
    return Response(status_code=204)


@router.get("/launches/{launch_id}/subscribers", response_model=list[LaunchSubscriberOut])
async def launch_subscribers(launch_id: int, db: DB) -> list[LaunchSubscriberOut]:
    rows = (
        await db.execute(select(LaunchSubscription).where(LaunchSubscription.launch_id == launch_id)
                         .order_by(LaunchSubscription.created_at.desc()).limit(5000))
    ).scalars().all()
    return [LaunchSubscriberOut.model_validate(r) for r in rows]


@router.post("/launches/{launch_id}/notify", response_model=LaunchNotifyOut)
async def notify_launch(launch_id: int, body: LaunchNotifyIn, db: DB, _: Admin) -> LaunchNotifyOut:
    queued = await launch_service.notify_subscribers(db, launch_id, message=body.message,
                                                     mark_launched=body.mark_launched)
    return LaunchNotifyOut(
        queued=queued,
        message=f"Queued {queued} notification email{'s' if queued != 1 else ''}." if queued
        else "Everyone subscribed has already been notified.",
    )
