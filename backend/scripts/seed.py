"""Seed the database with the SPUNI catalogue, hero banners, launches and an admin.

Usage (from the backend folder):
    python -m scripts.seed                      # uses ../src/assets for images
    python -m scripts.seed --assets /path/to/images --admin-email you@example.com

Idempotent: existing catalogue data is preserved, while missing seed colors are backfilled.
"""

import argparse
import asyncio
import shutil
import uuid
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import BASE_DIR, settings
from app.core.security import utcnow
from app.db.session import SessionLocal
from app.models import Banner, Category, Launch, Product, ProductColor, ProductImage, User, Wallet
from app.models.enums import LaunchStatus, UserRole
from app.services.media import store_image_bytes
from app.services.store import get_store_settings
from scripts.migrate_media_to_db import migrate as migrate_media_to_db

DEFAULT_ASSETS = BASE_DIR.parent / "src" / "assets"

CATEGORIES = [
    ("Shoulder Bags", "shoulder-bags", "signature-tote.jpg", "Structured silhouettes for everyday rituals."),
    ("Wallets", "wallets", "wallet.jpeg", "Slim, stitched, made to age with you."),
    ("Sling Bags", "sling-bags", "sling-crossbody.webp", "Hands-free, never style-free."),
    ("Laptop Bags", "laptop-bags", "briefcase.jpeg", "Workdays, carried well."),
    ("Belts", "belts", "belt.jpeg", "The quiet finishing touch."),
    ("Travel Bags", "travel-bags", "travel.jpeg", "For journeys yet to come."),
]

SUBCATEGORIES = [
    ("Totes", "shoulder-bags-totes", "shoulder-bags"),
    ("Handbags", "shoulder-bags-handbags", "shoulder-bags"),
    ("Classic Wallets", "wallets-classic", "wallets"),
    ("Slim Wallets", "wallets-slim", "wallets"),
    ("Card & Passport Holders", "wallets-card-passport", "wallets"),
    ("Crossbody Bags", "sling-bags-crossbody", "sling-bags"),
    ("Laptop Bags", "laptop-bags-laptop", "laptop-bags"),
    ("Backpacks", "laptop-bags-backpacks", "laptop-bags"),
    ("Leather Belts", "belts-leather", "belts"),
    ("Duffel Bags", "travel-bags-duffels", "travel-bags"),
    ("Weekenders", "travel-bags-weekenders", "travel-bags"),
    ("Cabin Luggage", "travel-bags-cabin", "travel-bags"),
]

CARE = (
    "Wipe clean with a soft, dry cloth. Keep away from prolonged direct sunlight and moisture. "
    "Store in the SPUNI dust bag, stuffed lightly to hold its shape."
)

PRODUCTS = [
    # name, slug, sku, category, subcategory, price, compare, stock, gender, image, badge, flags, color, dims
    ("Executive Briefcase", "executive-briefcase", "SPN-LB-001", "laptop-bags",
     "laptop-bags-laptop", 14999, 17999, 18, "men",
     "briefcase.jpeg", "Best Seller", {"bestseller", "featured", "customizable"}, "Walnut Brown",
     "41 x 30 x 9 cm, fits 15.6\" laptops"),
    ("Urban Backpack", "urban-backpack", "SPN-LB-002", "laptop-bags",
     "laptop-bags-backpacks", 11999, None, 22, "unisex",
     "backpack.jpeg", "New", {"bestseller", "featured"}, "Tan", "44 x 31 x 14 cm"),
    ("Classic Wallet", "classic-wallet", "SPN-WL-001", "wallets", "wallets-classic", 3999, None, 40, "men",
     "wallet.jpeg", None, {"bestseller", "customizable"}, "Espresso", "11.5 x 9.5 cm, 8 card slots"),
    ("Minimal Wallet", "minimal-wallet", "SPN-WL-002", "wallets", "wallets-slim", 4499, 4999, 35, "unisex",
     "minimal-wallet.jpeg", None, {"bestseller", "customizable"}, "Cognac", "10 x 8 cm, 4 card slots"),
    ("Passport Holder", "passport-holder", "SPN-WL-003", "wallets", "wallets-card-passport", 3499, None, 30, "unisex",
     "passport-holder.jpg", None, {"bestseller", "customizable"}, "Burgundy", "14 x 10 cm"),
    ("Leather Belt", "leather-belt", "SPN-BT-001", "belts", "belts-leather", 2499, None, 50, "men",
     "belt.jpeg", None, {"bestseller", "customizable"}, "Dark Brown", "35 mm width, brass buckle"),
    ("Signature Tote", "signature-tote", "SPN-SB-001", "shoulder-bags",
     "shoulder-bags-totes", 12999, 14999, 15, "women",
     "signature-tote.jpg", "New", {"bestseller", "featured", "customizable"}, "Caramel", "38 x 30 x 13 cm"),
    ("Classic Handbag", "classic-handbag", "SPN-SB-002", "shoulder-bags",
     "shoulder-bags-handbags", 14999, None, 12, "women",
     "classic-handbag.jpeg", None, {"bestseller", "featured"}, "Oxblood", "30 x 22 x 12 cm"),
    ("Sling Crossbody", "sling-crossbody", "SPN-SL-001", "sling-bags", "sling-bags-crossbody", 8999, None, 20, "women",
     "sling-crossbody.webp", None, {"bestseller", "customizable"}, "Chestnut", "24 x 17 x 7 cm"),
    ("Travel Duffel", "travel-duffel", "SPN-TR-001", "travel-bags", "travel-bags-duffels", 15999, 18999, 10, "unisex",
     "travel_duffel.jpeg", "New", {"bestseller", "featured"}, "Saddle Brown", "52 x 28 x 26 cm, 38 L"),
    ("Cabin Luggage", "cabin-luggage", "SPN-TR-002", "travel-bags", "travel-bags-cabin", 18999, None, 8, "unisex",
     "cabin-luggage.jpeg", None, {"bestseller"}, "Mocha", "55 x 36 x 22 cm, cabin size"),
    ("Weekender Bag", "weekender-bag", "SPN-TR-003", "travel-bags", "travel-bags-weekenders", 13999, None, 14, "unisex",
     "weekender.jpeg", None, {"bestseller", "featured"}, "Antique Tan", "50 x 30 x 24 cm"),
]

COLOR_HEX = {
    "Walnut Brown": "#654321",
    "Tan": "#D2A679",
    "Espresso": "#4B3621",
    "Cognac": "#9A463D",
    "Burgundy": "#800020",
    "Dark Brown": "#3B2417",
    "Caramel": "#C68E17",
    "Oxblood": "#4A0C18",
    "Chestnut": "#954535",
    "Saddle Brown": "#8B4513",
    "Mocha": "#6F4E37",
    "Antique Tan": "#B68A60",
}

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

    async def url(self, filename: str, folder: str, db: AsyncSession) -> str | None:
        key = (filename, folder)
        if key in self.cache:
            return self.cache[key]
        path = self.root / filename
        if not path.exists():
            print(f"  ! missing asset {path}, skipping image")
            return None
        stored = await store_image_bytes(path.read_bytes(), folder, filename, db)
        self.cache[key] = stored.url
        return stored.url


async def seed(assets_dir: Path, admin_email: str | None) -> None:
    assets = Assets(assets_dir)
    async with SessionLocal() as db:
        store = await get_store_settings(db)
        film_src = assets.root / "film.mp4"
        vintage_video = store.home_media.get("vintage_video") or "/assets/film.mp4"
        if film_src.exists() and not vintage_video.startswith(f"{settings.media_url}/"):
            homepage_dir = settings.media_root / "homepage"
            homepage_dir.mkdir(parents=True, exist_ok=True)
            film_name = f"{uuid.uuid4().hex}.mp4"
            shutil.copy2(film_src, homepage_dir / film_name)
            vintage_video = f"{settings.media_url}/homepage/{film_name}"

        async def homepage_image(filename: str) -> str:
            return await assets.url(filename, "homepage", db) or f"/assets/{filename}"

        store.home_media = {
            "gift_teaser": await homepage_image("classic-handbag.jpeg"),
            "customization_catalog": await homepage_image("customization-finished.png"),
            "customization_upload": await homepage_image("customization-sketch.png"),
            "customization_expert": await homepage_image("craftsmanship.jpeg"),
            "ethical_source": await homepage_image("source.jpeg"),
            "ethical_refined": await homepage_image("refined.jpeg"),
            "ethical_crafted": await homepage_image("crafted.jpeg"),
            "ethical_carried": await homepage_image("carried.jpeg"),
            "ethical_leather_rolls": await homepage_image("leather-rolls.jpeg"),
            "vintage_poster": await homepage_image("video-poster.png"),
            "vintage_video": vintage_video,
            "men_card": await homepage_image("for-him.jpeg"),
            "women_card": await homepage_image("for-her.jpeg"),
            "login_carried": await homepage_image("carried.jpeg"),
        }

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
                               description=DESCRIPTIONS.get(slug),
                               image_url=await assets.url(image, "categories", db))
                db.add(row)
                print(f"+ category {name}")
            categories[slug] = row
        await db.flush()

        subcategories: dict[str, Category] = {}
        for order, (name, slug, parent_slug) in enumerate(SUBCATEGORIES):
            row = (await db.execute(select(Category).where(Category.slug == slug))).scalar_one_or_none()
            if row is None:
                row = Category(
                    name=name,
                    slug=slug,
                    parent_id=categories[parent_slug].id,
                    sort_order=order,
                    description=f"{name} from the {categories[parent_slug].name} collection.",
                    is_active=True,
                    show_in_menu=True,
                )
                db.add(row)
                print(f"+ subcategory {name}")
            subcategories[slug] = row
        await db.flush()

        detail = await assets.url("leather-detail.jpeg", "products", db)
        craft = await assets.url("craftsmanship.jpeg", "products", db)
        for order, (name, slug, sku, cat, subcat, price, compare, stock, gender, image, badge, flags, color, dims) \
                in enumerate(PRODUCTS):
            existing = (await db.execute(
                select(Product).where(Product.slug == slug).options(
                    selectinload(Product.images), selectinload(Product.colors)
                )
            )).scalar_one_or_none()
            if existing:
                existing.category_id = categories[cat].id
                existing.subcategory_id = subcategories[subcat].id
                if not existing.colors:
                    color_option = ProductColor(
                        name=color, hex_code=COLOR_HEX.get(color, "#000000"), sort_order=0
                    )
                    existing.colors.append(color_option)
                    if existing.images:
                        existing.images[0].color = color_option
                        existing.images[0].is_primary = True
                continue
            product = Product(
                category_id=categories[cat].id, subcategory_id=subcategories[subcat].id,
                name=name, slug=slug, sku=sku,
                short_description=f"{color} vegan leather, handcrafted in Chennai.",
                description=DESCRIPTIONS[cat], price_paise=price * 100,
                compare_at_price_paise=compare * 100 if compare else None, stock=stock, gender=gender,
                material="Premium vegan leather", color=color, dimensions=dims, care_instructions=CARE,
                badge=badge, is_bestseller="bestseller" in flags, is_featured="featured" in flags,
                is_customizable="customizable" in flags, sort_order=order,
                meta_title=f"{name} | SPUNI Leathers",
                meta_description=f"Shop the SPUNI {name}: {color.lower()} vegan leather, handcrafted in India.",
                images=[],
                colors=[ProductColor(name=color, hex_code=COLOR_HEX.get(color, "#000000"), sort_order=0)],
            )
            main = await assets.url(image, "products", db)
            color_option = product.colors[0]
            if main:
                product.images.append(ProductImage(
                    url=main, alt=f"{name} main image", sort_order=0,
                    color=color_option, is_primary=True,
                ))
            for index, url in enumerate((image for image in (detail, craft) if image), start=1):
                product.images.append(ProductImage(url=url, alt=f"{name} view {index}", sort_order=index))
            db.add(product)
            print(f"+ product {name}")
        await db.flush()

        if not await db.scalar(select(Banner.id).limit(1)):
            for order, (one, two, image, alt, link) in enumerate(BANNERS):
                url = await assets.url(image, "banners", db)
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
                          image_url=await assets.url(image, "launches", db), launch_at=utcnow() + timedelta(days=days),
                          status=LaunchStatus.UPCOMING, category_id=categories[cat].id, sort_order=order))
            print(f"+ launch {title}")

        await db.commit()
    await migrate_media_to_db()
    print("Seed complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--admin-email", default=settings.initial_admin_email)
    args = parser.parse_args()
    asyncio.run(seed(args.assets, args.admin_email))


if __name__ == "__main__":
    main()
