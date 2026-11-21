"""shorten default configurable marquee text

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-21
"""

from alembic import op


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE store_settings SET "
        "header_text_1 = 'Handcrafted in Chennai', "
        "header_text_2 = 'Free monogramming' "
        "WHERE header_text_1 = 'Handcrafted vegan leather, Chennai' "
        "AND header_text_2 = 'Free monogramming on customisable pieces'"
    )
    op.alter_column("store_settings", "header_text_1",
                    server_default="Handcrafted in Chennai")
    op.alter_column("store_settings", "header_text_2",
                    server_default="Free monogramming")


def downgrade() -> None:
    op.alter_column("store_settings", "header_text_1",
                    server_default="Handcrafted vegan leather, Chennai")
    op.alter_column("store_settings", "header_text_2",
                    server_default="Free monogramming on customisable pieces")
