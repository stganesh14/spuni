"""add category subcategories and product subcategory assignments

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-21
"""

import sqlalchemy as sa
from alembic import op


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


SUBCATEGORIES = [
    ("shoulder-bags", "Totes", "shoulder-bags-totes"),
    ("shoulder-bags", "Handbags", "shoulder-bags-handbags"),
    ("wallets", "Classic Wallets", "wallets-classic"),
    ("wallets", "Slim Wallets", "wallets-slim"),
    ("wallets", "Card & Passport Holders", "wallets-card-passport"),
    ("sling-bags", "Crossbody Bags", "sling-bags-crossbody"),
    ("laptop-bags", "Laptop Bags", "laptop-bags-laptop"),
    ("laptop-bags", "Backpacks", "laptop-bags-backpacks"),
    ("belts", "Leather Belts", "belts-leather"),
    ("travel-bags", "Duffel Bags", "travel-bags-duffels"),
    ("travel-bags", "Weekenders", "travel-bags-weekenders"),
    ("travel-bags", "Cabin Luggage", "travel-bags-cabin"),
]


def upgrade() -> None:
    op.drop_constraint("uq_categories_name", "categories", type_="unique")
    op.add_column("categories", sa.Column("parent_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"], unique=False)
    op.create_foreign_key("fk_categories_parent_id", "categories", "categories",
                          ["parent_id"], ["id"], ondelete="CASCADE")

    op.add_column("products", sa.Column("subcategory_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_products_subcategory_id", "products", ["subcategory_id"], unique=False)
    op.create_foreign_key("fk_products_subcategory_id", "products", "categories",
                          ["subcategory_id"], ["id"], ondelete="SET NULL")

    bind = op.get_bind()
    subcat_ids: dict[str, int] = {}
    for parent_slug, name, slug in SUBCATEGORIES:
        parent_id = bind.execute(
            sa.text("SELECT id FROM categories WHERE slug = :slug"), {"slug": parent_slug}
        ).scalar()
        if parent_id is None:
            continue
        existing_id = bind.execute(
            sa.text("SELECT id FROM categories WHERE slug = :slug"), {"slug": slug}
        ).scalar()
        if existing_id is None:
            existing_id = bind.execute(
                sa.text(
                    "INSERT INTO categories "
                    "(name, slug, parent_id, sort_order, is_active, show_in_menu, updated_at) "
                    "VALUES (:name, :slug, :parent_id, 0, true, true, now()) "
                    "RETURNING id"
                ),
                {"name": name, "slug": slug, "parent_id": parent_id},
            ).scalar_one()
        subcat_ids[slug] = int(existing_id)

    assignments = {
        "signature-tote": "shoulder-bags-totes",
        "classic-handbag": "shoulder-bags-handbags",
        "classic-wallet": "wallets-classic",
        "minimal-wallet": "wallets-slim",
        "passport-holder": "wallets-card-passport",
        "sling-crossbody": "sling-bags-crossbody",
        "executive-briefcase": "laptop-bags-laptop",
        "urban-backpack": "laptop-bags-backpacks",
        "leather-belt": "belts-leather",
        "travel-duffel": "travel-bags-duffels",
        "weekender-bag": "travel-bags-weekenders",
        "cabin-luggage": "travel-bags-cabin",
    }
    for product_slug, sub_slug in assignments.items():
        subcategory_id = subcat_ids.get(sub_slug)
        if subcategory_id:
            bind.execute(
                sa.text("UPDATE products SET subcategory_id = :subcategory_id WHERE slug = :slug"),
                {"subcategory_id": subcategory_id, "slug": product_slug},
            )


def downgrade() -> None:
    op.drop_constraint("fk_products_subcategory_id", "products", type_="foreignkey")
    op.drop_index("ix_products_subcategory_id", table_name="products")
    op.drop_column("products", "subcategory_id")
    op.execute(sa.text("DELETE FROM categories WHERE parent_id IS NOT NULL"))
    op.drop_constraint("fk_categories_parent_id", "categories", type_="foreignkey")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_column("categories", "parent_id")
    op.create_unique_constraint("uq_categories_name", "categories", ["name"])
