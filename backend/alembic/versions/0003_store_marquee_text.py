"""add configurable storefront marquee text

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-21
"""

import sqlalchemy as sa
from alembic import op


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "store_settings",
        sa.Column("header_text_1", sa.String(length=160), nullable=False,
                  server_default="Handcrafted in Chennai"),
    )
    op.add_column(
        "store_settings",
        sa.Column("header_text_2", sa.String(length=160), nullable=False,
                  server_default="Free monogramming"),
    )
    op.add_column(
        "store_settings",
        sa.Column("customization_marquee_text", sa.String(length=160), nullable=False,
                  server_default="Made for you. Stitched by hand."),
    )


def downgrade() -> None:
    op.drop_column("store_settings", "customization_marquee_text")
    op.drop_column("store_settings", "header_text_2")
    op.drop_column("store_settings", "header_text_1")
