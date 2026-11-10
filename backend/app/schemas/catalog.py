from datetime import datetime

from app.schemas.common import Email, InputModel, OutputModel


class ImageOut(OutputModel):
    id: int
    url: str
    alt: str | None
    sort_order: int


class CategoryOut(OutputModel):
    id: int
    name: str
    slug: str
    tagline: str | None
    description: str | None
    image_url: str | None
    banner_url: str | None
    sort_order: int
    product_count: int = 0


class CategoryRef(OutputModel):
    id: int
    name: str
    slug: str


class ProductCard(OutputModel):
    id: int
    name: str
    slug: str
    short_description: str | None
    price_paise: int
    compare_at_price_paise: int | None
    badge: str | None
    image_url: str | None
    hover_image_url: str | None
    in_stock: bool
    is_customizable: bool
    gender: str
    category: CategoryRef


class ProductDetail(ProductCard):
    sku: str
    description: str | None
    stock_status: str  # in_stock | low_stock | out_of_stock
    available_quantity: int
    material: str | None
    color: str | None
    dimensions: str | None
    weight_grams: int | None
    care_instructions: str | None
    images: list[ImageOut]
    meta_title: str | None
    meta_description: str | None
    related: list[ProductCard] = []


class MenuProduct(OutputModel):
    name: str
    slug: str
    gender: str


class MenuCategory(OutputModel):
    name: str
    slug: str
    image_url: str | None
    tagline: str | None
    products: list[MenuProduct]


class MenuOut(OutputModel):
    categories: list[MenuCategory]
    featured: list[ProductCard]


class BannerOut(OutputModel):
    id: int
    title_one: str
    title_two: str | None
    image_url: str
    alt: str | None
    link_url: str | None


class LaunchOut(OutputModel):
    id: int
    title: str
    slug: str
    tagline: str | None
    description: str | None
    image_url: str | None
    launch_at: datetime | None
    status: str
    category: CategoryRef | None
    product_slug: str | None
    subscriber_count: int = 0


class LaunchSubscribeIn(InputModel):
    email: Email | None = None


class LaunchSubscribeOut(OutputModel):
    subscribed: bool
    message: str


class HomeOut(OutputModel):
    banners: list[BannerOut]
    launches: list[LaunchOut]
    bestsellers: list[ProductCard]
    featured: list[ProductCard]
    categories: list[CategoryOut]
