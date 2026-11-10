"""Server-side cart pricing. Client prices are never trusted."""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Category, Product, StoreSettings
from app.schemas.orders import CartLineIn, QuoteLine, QuoteOut


@dataclass
class PricedCart:
    lines: list[QuoteLine]
    products: dict[int, Product]
    subtotal_paise: int
    shipping_paise: int
    gift_wrap_paise: int
    wallet_applied_paise: int
    total_paise: int
    reward_paise: int
    issues: list[str] = field(default_factory=list)


def merge_lines(items: list[CartLineIn]) -> dict[int, int]:
    merged: dict[int, int] = {}
    for item in items:
        merged[item.product_id] = min(10, merged.get(item.product_id, 0) + item.quantity)
    return merged


def shipping_for(subtotal: int, settings: StoreSettings) -> int:
    if subtotal <= 0 or subtotal >= settings.free_shipping_threshold_paise:
        return 0
    return settings.shipping_flat_paise


def max_redeemable(subtotal: int, balance: int, settings: StoreSettings, payable_before_wallet: int) -> int:
    cap = subtotal * settings.wallet_max_redeem_percent // 100
    return max(0, min(balance, cap, payable_before_wallet))


def reward_for(subtotal: int, wallet_applied: int, settings: StoreSettings) -> int:
    eligible = max(0, subtotal - wallet_applied)
    reward = eligible * settings.wallet_earn_percent // 100
    return reward - reward % 100  # whole rupees only


async def price_cart(
    db: AsyncSession, *, items: list[CartLineIn], settings: StoreSettings, wallet_balance: int,
    use_wallet: bool, gift_wrap: bool, lock: bool = False,
) -> PricedCart:
    merged = merge_lines(items)
    query = (
        select(Product)
        .join(Product.category)
        .where(Product.id.in_(merged.keys()))
        .options(selectinload(Product.images), selectinload(Product.category))
        .order_by(Product.id)
    )
    if lock:
        query = query.with_for_update(of=Product)
    products = {p.id: p for p in (await db.execute(query)).scalars().all()}

    lines: list[QuoteLine] = []
    issues: list[str] = []
    subtotal = 0
    for product_id, quantity in merged.items():
        product = products.get(product_id)
        if product is None or not product.is_active or not isinstance(product.category, Category) \
                or not product.category.is_active:
            issues.append(f"An item in your bag is no longer available (#{product_id}).")
            continue
        available = min(product.stock, 10)
        issue = None
        if available <= 0:
            issue = "Out of stock"
        elif quantity > available:
            issue = f"Only {available} left"
        line_total = product.price_paise * quantity
        lines.append(
            QuoteLine(
                product_id=product.id,
                name=product.name,
                slug=product.slug,
                image_url=product.primary_image,
                unit_price_paise=product.price_paise,
                quantity=quantity,
                line_total_paise=line_total,
                available_quantity=available,
                issue=issue,
            )
        )
        if issue:
            issues.append(f"{product.name}: {issue.lower()}.")
        subtotal += line_total

    shipping = shipping_for(subtotal, settings)
    wrap = settings.gift_wrap_paise if gift_wrap and subtotal > 0 else 0
    payable = subtotal + shipping + wrap
    wallet_applied = max_redeemable(subtotal, wallet_balance, settings, payable) if use_wallet else 0
    return PricedCart(
        lines=lines,
        products=products,
        subtotal_paise=subtotal,
        shipping_paise=shipping,
        gift_wrap_paise=wrap,
        wallet_applied_paise=wallet_applied,
        total_paise=payable - wallet_applied,
        reward_paise=reward_for(subtotal, wallet_applied, settings),
        issues=issues,
    )


def quote_out(priced: PricedCart, settings: StoreSettings, wallet_balance: int) -> QuoteOut:
    return QuoteOut(
        lines=priced.lines,
        subtotal_paise=priced.subtotal_paise,
        shipping_paise=priced.shipping_paise,
        gift_wrap_paise=priced.gift_wrap_paise,
        wallet_balance_paise=wallet_balance,
        wallet_applied_paise=priced.wallet_applied_paise,
        total_paise=priced.total_paise,
        wallet_reward_estimate_paise=priced.reward_paise,
        free_shipping_threshold_paise=settings.free_shipping_threshold_paise,
        has_issues=bool(priced.issues),
    )
