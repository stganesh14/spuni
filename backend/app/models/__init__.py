"""Import every model so SQLAlchemy metadata (and Alembic) see all tables."""

from app.models.catalog import (
    Banner, Category, Launch, LaunchSubscription, MediaAsset, Product,
    ProductColor, ProductImage, WishlistItem,
)
from app.models.engagement import ContactMessage, CustomizationFile, CustomizationRequest, EmailOutbox
from app.models.order import (
    GiftCard,
    Order,
    OrderEvent,
    OrderItem,
    Payment,
    StoreSettings,
    Wallet,
    WalletTransaction,
)
from app.models.user import Address, AuthSession, OtpCode, User

__all__ = [
    "Address",
    "AuthSession",
    "Banner",
    "Category",
    "ContactMessage",
    "CustomizationFile",
    "CustomizationRequest",
    "EmailOutbox",
    "GiftCard",
    "Launch",
    "LaunchSubscription",
    "Order",
    "OrderEvent",
    "OrderItem",
    "OtpCode",
    "Payment",
    "MediaAsset",
    "Product",
    "ProductColor",
    "ProductImage",
    "StoreSettings",
    "User",
    "Wallet",
    "WalletTransaction",
    "WishlistItem",
]
