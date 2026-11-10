from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin
from app.models.enums import Gender, LaunchStatus, check_in

SLUG_CHECK = r"slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'"


class Category(IdMixin, TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint(SLUG_CHECK, name="slug_format"),
        CheckConstraint("length(trim(name)) >= 2", name="name_len"),
        CheckConstraint("sort_order >= 0", name="sort_order_positive"),
    )

    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(90), unique=True, nullable=False)
    tagline: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    banner_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    show_in_menu: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(IdMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint(SLUG_CHECK, name="slug_format"),
        CheckConstraint(r"sku ~ '^[A-Z0-9-]{3,40}$'", name="sku_format"),
        CheckConstraint("length(trim(name)) >= 2", name="name_len"),
        CheckConstraint("price_paise > 0 AND price_paise <= 100000000", name="price_range"),
        CheckConstraint(
            "compare_at_price_paise IS NULL OR compare_at_price_paise > price_paise",
            name="compare_at_gt_price",
        ),
        CheckConstraint("stock >= 0", name="stock_non_negative"),
        CheckConstraint("weight_grams IS NULL OR weight_grams > 0", name="weight_positive"),
        CheckConstraint("sort_order >= 0", name="sort_order_positive"),
        check_in("gender", Gender),
        Index("ix_products_active_category", "is_active", "category_id"),
    )

    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    short_description: Mapped[str | None] = mapped_column(String(280))
    description: Mapped[str | None] = mapped_column(Text)
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    compare_at_price_paise: Mapped[int | None] = mapped_column(BigInteger)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    gender: Mapped[str] = mapped_column(String(10), nullable=False, default=Gender.UNISEX, server_default=Gender.UNISEX)
    material: Mapped[str | None] = mapped_column(String(120))
    color: Mapped[str | None] = mapped_column(String(60))
    dimensions: Mapped[str | None] = mapped_column(String(120))
    weight_grams: Mapped[int | None] = mapped_column(Integer)
    care_instructions: Mapped[str | None] = mapped_column(Text)
    badge: Mapped[str | None] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_bestseller: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_customizable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    meta_title: Mapped[str | None] = mapped_column(String(160))
    meta_description: Mapped[str | None] = mapped_column(String(300))

    category: Mapped[Category] = relationship(back_populates="products")
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="(ProductImage.sort_order, ProductImage.id)",
    )

    @property
    def primary_image(self) -> str | None:
        return self.images[0].url if self.images else None


class ProductImage(IdMixin, Base):
    __tablename__ = "product_images"
    __table_args__ = (CheckConstraint("sort_order >= 0", name="sort_order_positive"),)

    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    alt: Mapped[str | None] = mapped_column(String(160))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped[Product] = relationship(back_populates="images")


class WishlistItem(IdMixin, Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped[Product] = relationship()


class Launch(IdMixin, TimestampMixin, Base):
    """An upcoming product / category launch shown in "What's new"."""

    __tablename__ = "launches"
    __table_args__ = (
        CheckConstraint(SLUG_CHECK, name="slug_format"),
        CheckConstraint("length(trim(title)) >= 2", name="title_len"),
        CheckConstraint("sort_order >= 0", name="sort_order_positive"),
        CheckConstraint("notify_count >= 0", name="notify_count_positive"),
        check_in("status", LaunchStatus),
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, nullable=False)
    tagline: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    launch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=LaunchStatus.DRAFT, server_default=LaunchStatus.DRAFT
    )
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categories.id", ondelete="SET NULL")
    )
    product_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("products.id", ondelete="SET NULL"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notify_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    category: Mapped[Category | None] = relationship()
    product: Mapped[Product | None] = relationship()
    subscriptions: Mapped[list["LaunchSubscription"]] = relationship(
        back_populates="launch", cascade="all, delete-orphan"
    )


class LaunchSubscription(IdMixin, Base):
    __tablename__ = "launch_subscriptions"
    __table_args__ = (
        UniqueConstraint("launch_id", "email"),
        CheckConstraint(r"email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'", name="email_format"),
    )

    launch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("launches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    unsubscribe_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    launch: Mapped[Launch] = relationship(back_populates="subscriptions")


class Banner(IdMixin, TimestampMixin, Base):
    """Hero slides on the home page."""

    __tablename__ = "banners"
    __table_args__ = (CheckConstraint("sort_order >= 0", name="sort_order_positive"),)

    title_one: Mapped[str] = mapped_column(String(80), nullable=False)
    title_two: Mapped[str | None] = mapped_column(String(80))
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    alt: Mapped[str | None] = mapped_column(String(160))
    link_url: Mapped[str | None] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
