"""store uploaded media in database and add product color galleries

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_assets",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("size_bytes >= 0", name="media_asset_size_non_negative"),
    )
    op.create_index("ix_media_assets_sha256", "media_assets", ["sha256"], unique=False)

    op.create_table(
        "product_colors",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("hex_code", sa.String(length=7), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.CheckConstraint("length(trim(name)) >= 1", name="product_color_name_len"),
        sa.CheckConstraint("hex_code ~ '^#[0-9A-Fa-f]{6}$'", name="product_color_hex_format"),
        sa.UniqueConstraint("product_id", "name", name="uq_product_color_name"),
    )
    op.create_index("ix_product_colors_product_id", "product_colors", ["product_id"], unique=False)

    op.add_column("product_images", sa.Column("color_id", sa.BigInteger(), nullable=True))
    op.add_column("product_images", sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_index("ix_product_images_color_id", "product_images", ["color_id"], unique=False)
    op.create_foreign_key("fk_product_images_color_id", "product_images", "product_colors",
                          ["color_id"], ["id"], ondelete="CASCADE")

    op.add_column("order_items", sa.Column("color_id", sa.BigInteger(), nullable=True))
    op.add_column("order_items", sa.Column("color_name", sa.String(length=60), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "color_name")
    op.drop_column("order_items", "color_id")
    op.drop_constraint("fk_product_images_color_id", "product_images", type_="foreignkey")
    op.drop_index("ix_product_images_color_id", table_name="product_images")
    op.drop_column("product_images", "is_primary")
    op.drop_column("product_images", "color_id")
    op.drop_index("ix_product_colors_product_id", table_name="product_colors")
    op.drop_table("product_colors")
    op.drop_index("ix_media_assets_sha256", table_name="media_assets")
    op.drop_table("media_assets")
