"""Seed the database with the SPUNI catalogue, hero banners, launches and an admin.

Usage (from the backend folder):
    python -m scripts.seed                      # uses ../src/assets for images
    python -m scripts.seed --assets /path/to/images --admin-email you@example.com

Idempotent: existing rows (matched by slug / email) are left untouched.
"""

import argparse
import asyncio
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import BASE_DIR, settings
from app.core.security import utcnow
from app.db.session import SessionLocal
from app.models import Banner, Category, Launch, Product, ProductImage, User, Wallet
from app.models.enums import LaunchStatus, UserRole
from app.services.media import store_image_bytes
from app.services.store import get_store_settings

DEFAULT_ASSETS = BASE_DIR.parent / "src" / "assets"

CATEGORIES = [
    ("Shoulder Bags", "shoulder-bags", "signature-tote.jpg", "Structured silhouettes for everyday rituals."),
    ("Wallets", "wallets", "wallet.jpeg", "Slim, stitched, made to age with you."),
    ("Sling Bags", "sling-bags", "sling-crossbody.webp", "Hands-free, never style-free."),
    ("Laptop Bags", "laptop-bags", "briefcase.jpeg", "Workdays, carried well."),
    ("Belts", "belts", "belt.jpeg", "The quiet finishing touch."),
    ("Travel Bags", "travel-bags", "travel.jpeg", "For journeys yet to come."),
]

CARE = (
    "Wipe clean with a soft, dry cloth. Keep away from prolonged direct sunlight and moisture. "
    "Store in the SPUNI dust bag, stuffed lightly to hold its shape."
)

PRODUCTS = [
    # name, slug, sku, category, price, compare, stock, gender, image, badge, flags, color, dims
    ("Executive Briefcase", "executive-briefcase", "SPN-LB-001", "laptop-bags", 14999, 17999, 18, "men",
     "briefcase.jpeg", "Best Seller", {"bestseller", "featured", "customizable"}, "Walnut Brown",
     "41 x 30 x 9 cm, fits 15.6\" laptops"),
    ("Urban Backpack", "urban-backpack", "SPN-LB-002", "laptop-bags", 11999, None, 22, "unisex",
     "backpack.jpeg", "New", {"bestseller", "featured"}, "Tan", "44 x 31 x 14 cm"),
    ("Classic Wallet", "classic-wallet", "SPN-WL-001", "wallets", 3999, None, 40, "men",
     "wallet.jpeg", None, {"bestseller", "customizable"}, "Espresso", "11.5 x 9.5 cm, 8 card slots"),
    ("Minimal Wallet", "minimal-wallet", "SPN-WL-002", "wallets", 4499, 4999, 35, "unisex",
     "minimal-wallet.jpeg", None, {"bestseller", "customizable"}, "Cognac", "10 x 8 cm, 4 card slots"),
    ("Passport Holder", "passport-holder", "SPN-WL-003", "wallets", 3499, None, 30, "unisex",
     "passport-holder.jpg", None, {"bestseller", "customizable"}, "Burgundy", "14 x 10 cm"),
    ("Leather Belt", "leather-belt", "SPN-BT-001", "belts", 2499, None, 50, "men",
     "belt.jpeg", None, {"bestseller", "customizable"}, "Dark Brown", "35 mm width, brass buckle"),
    ("Signature Tote", "signature-tote", "SPN-SB-001", "shoulder-bags", 12999, 14999, 15, "women",
     "signature-tote.jpg", "New", {"bestseller", "featured", "customizable"}, "Caramel", "38 x 30 x 13 cm"),
    ("Classic Handbag", "classic-handbag", "SPN-SB-002", "shoulder-bags", 14999, None, 12, "women",
     "classic-handbag.jpeg", None, {"bestseller", "featured"}, "Oxblood", "30 x 22 x 12 cm"),
    ("Sling Crossbody", "sling-crossbody", "SPN-SL-001", "sling-bags", 8999, None, 20, "women",
     "sling-crossbody.webp", None, {"bestseller", "customizable"}, "Chestnut", "24 x 17 x 7 cm"),
    ("Travel Duffel", "travel-duffel", "SPN-TR-001", "travel-bags", 15999, 18999, 10, "unisex",
     "travel_duffel.jpeg", "New", {"bestseller", "featured"}, "Saddle Brown", "52 x 28 x 26 cm, 38 L"),
    ("Cabin Luggage", "cabin-luggage", "SPN-TR-002", "travel-bags", 18999, None, 8, "unisex",
     "cabin-luggage.jpeg", None, {"bestseller"}, "Mocha", "55 x 36 x 22 cm, cabin size"),
    ("Weekender Bag", "weekender-bag", "SPN-TR-003", "travel-bags", 13999, None, 14, "unisex",
     "weekender.jpeg", None, {"bestseller", "featured"}, "Antique Tan", "50 x 30 x 24 cm"),
]

DESCRIPTIONS = {
    "laptop-bags": "Built for the commute and the boardroom alike, with a padded laptop sleeve, organised "
                   "pockets and hand-finished edges that soften with every day you carry it.",
    "wallets": "Cut from a single hide of premium vegan leather, hand-stitched with waxed thread and edge "
               "painted in layers so it stays slim, strong and beautiful for years.",
    "belts": "A full-grain finish vegan leather strap with a solid brass buckle, burnished by hand. "
             "It wears in, never out.",
    "shoulder-bags": "A structured shoulder bag with a soft interior lining, magnetic closure and enough "
                     "room for every everyday ritual. Designed to age beautifully.",
    "sling-bags": "A compact crossbody with an adjustable strap and a secure zip pocket, made for "
                  "hands-free days and evenings out.",
    "travel-bags": "Generous, sturdy and handsome: reinforced handles, brass hardware and a water-resistant "
                   "lining for every journey yet to come.",
}

BANNERS = [
    ("Made for", "everyday rituals.", "hero1.png", "Woman carrying a vintage leather handbag", "/shop"),
    ("Carry a little", "history.", "hero2.png", "Woman with a handcrafted leather bag", "/category/shoulder-bags"),
    ("Beautifully", "uncomplicated.", "hero3.png", "Woman wearing elegant leather accessories", "/shop"),
    ("Objects with", "a soul.", "hero4.png", "Luxury handcrafted leather handbag", "/customization"),
]


class Assets:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.cache: dict[tuple[str, str], str] = {}

    def url(self, filename: str, folder: str) -> str | None:
        key = (filename, folder)
        if key in self.cache:
            return self.cache[key]
        path = self.root / filename
        if not path.exists():
            print(f"  ! missing asset {path}, skipping image")
            return None
        stored = store_image_bytes(path.read_bytes(), folder, filename)
        self.cache[key] = stored.url
        return stored.url


async def seed(assets_dir: Path, admin_email: str | None) -> None:
    assets = Assets(assets_dir)
    async with SessionLocal() as db:
        await get_store_settings(db)

        if admin_email:
            admin = (await db.execute(select(User).where(User.email == admin_email.lower()))).scalar_one_or_none()
            if admin is None:
                admin = User(email=admin_email.lower(), full_name=settings.initial_admin_name, role=UserRole.ADMIN,
                             email_verified_at=utcnow())
                db.add(admin)
                await db.flush()
                db.add(Wallet(user_id=admin.id))
                print(f"+ admin {admin_email}")
            elif admin.role != UserRole.ADMIN:
                admin.role = UserRole.ADMIN
                print(f"* promoted {admin_email} to admin")

        categories: dict[str, Category] = {}
        for order, (name, slug, image, tagline) in enumerate(CATEGORIES):
            row = (await db.execute(select(Category).where(Category.slug == slug))).scalar_one_or_none()
            if row is None:
                row = Category(name=name, slug=slug, tagline=tagline, sort_order=order,
                               description=DESCRIPTIONS.get(slug), image_url=assets.url(image, "categories"))
                db.add(row)
                print(f"+ category {name}")
            categories[slug] = row
        await db.flush()

        detail = assets.url("leather-detail.jpeg", "products")
        craft = assets.url("craftsmanship.jpeg", "products")
        for order, (name, slug, sku, cat, price, compare, stock, gender, image, badge, flags, color, dims) \
                in enumerate(PRODUCTS):
            if await db.scalar(select(Product.id).where(Product.slug == slug)):
                continue
            product = Product(
                category_id=categories[cat].id, name=name, slug=slug, sku=sku,
                short_description=f"{color} vegan leather, handcrafted in Chennai.",
                description=DESCRIPTIONS[cat], price_paise=price * 100,
                compare_at_price_paise=compare * 100 if compare else None, stock=stock, gender=gender,
                material="Premium vegan leather", color=color, dimensions=dims, care_instructions=CARE,
                badge=badge, is_bestseller="bestseller" in flags, is_featured="featured" in flags,
                is_customizable="customizable" in flags, sort_order=order,
                meta_title=f"{name} | SPUNI Leathers",
                meta_description=f"Shop the SPUNI {name}: {color.lower()} vegan leather, handcrafted in India.",
                images=[],
            )
            main = assets.url(image, "products")
            for index, url in enumerate(u for u in (main, detail, craft) if u):
                product.images.append(ProductImage(url=url, alt=f"{name} view {index + 1}", sort_order=index))
            db.add(product)
            print(f"+ product {name}")
        await db.flush()

        if not await db.scalar(select(Banner.id).limit(1)):
            for order, (one, two, image, alt, link) in enumerate(BANNERS):
                url = assets.url(image, "banners")
                if url:
                    db.add(Banner(title_one=one, title_two=two, image_url=url, alt=alt, link_url=link,
                                  sort_order=order))
            print("+ hero banners")

        launches = [
            ("The Heritage Satchel", "heritage-satchel", "A satchel inspired by our grandfathers' school bags.",
             "Hand-burnished flaps, twin brass buckles and a story in every stitch. Limited first edition of "
             "200 pieces.", "whatsnew.png", 12, "shoulder-bags"),
            ("Monogram Card Holder", "monogram-card-holder", "Your initials, hot-stamped in gold.",
             "A slim card holder you can personalise at checkout, launching with five new heritage colours.",
             "minimal-wallet.jpeg", 26, "wallets"),
            ("The Voyager Collection", "voyager-collection", "A full travel line for slow journeys.",
             "Trunks, garment carriers and a reimagined weekender, crafted for the long way round.",
             "leather-rolls.jpeg", 45, "travel-bags"),
        ]
        for order, (title, slug, tagline, description, image, days, cat) in enumerate(launches):
            if await db.scalar(select(Launch.id).where(Launch.slug == slug)):
                continue
            db.add(Launch(title=title, slug=slug, tagline=tagline, description=description,
                          image_url=assets.url(image, "launches"), launch_at=utcnow() + timedelta(days=days),
                          status=LaunchStatus.UPCOMING, category_id=categories[cat].id, sort_order=order))
            print(f"+ launch {title}")

        await db.commit()
    print("Seed complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--admin-email", default=settings.initial_admin_email)
    args = parser.parse_args()
    asyncio.run(seed(args.assets, args.admin_email))


if __name__ == "__main__":
    main()
