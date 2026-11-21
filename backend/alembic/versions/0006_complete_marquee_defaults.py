"""set complete default lines for running text fields

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-21
"""

from alembic import op


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


HEADER_TEXT_1 = "Free shipping over ₹3000\nEarn up to 5% as Spuni Cash"
HEADER_TEXT_2 = "Handcrafted vegan leather, Chennai\nFree monogramming on customisable pieces"
CUSTOMIZATION_TEXT = "Cut\nStitched\nBurnished\nCarried\nLoved\nPassed on"


def upgrade() -> None:
    op.execute(
        "UPDATE store_settings SET "
        "header_text_1 = 'Free shipping over ₹3000' || chr(10) || 'Earn up to 5% as Spuni Cash', "
        "header_text_2 = 'Handcrafted vegan leather, Chennai' || chr(10) || 'Free monogramming on customisable pieces', "
        "customization_marquee_text = 'Cut' || chr(10) || 'Stitched' || chr(10) || 'Burnished' || chr(10) || 'Carried' || chr(10) || 'Loved' || chr(10) || 'Passed on'"
        " WHERE header_text_1 = 'Handcrafted in Chennai' "
        "AND header_text_2 = 'Free monogramming'"
    )
    op.execute(
        "UPDATE store_settings SET "
        "header_text_1 = 'Free shipping over ₹3000' || chr(10) || 'Earn up to 5% as Spuni Cash' "
        "WHERE TRIM(header_text_1) = ''"
    )
    op.execute(
        "UPDATE store_settings SET "
        "header_text_2 = 'Handcrafted vegan leather, Chennai' || chr(10) || 'Free monogramming on customisable pieces' "
        "WHERE TRIM(header_text_2) = ''"
    )
    op.execute(
        "UPDATE store_settings SET "
        "customization_marquee_text = 'Cut' || chr(10) || 'Stitched' || chr(10) || 'Burnished' || chr(10) || 'Carried' || chr(10) || 'Loved' || chr(10) || 'Passed on' "
        "WHERE TRIM(customization_marquee_text) IN ('', 'Made for you. Stitched by hand.')"
    )
    op.alter_column("store_settings", "header_text_1", server_default=HEADER_TEXT_1)
    op.alter_column("store_settings", "header_text_2", server_default=HEADER_TEXT_2)
    op.alter_column("store_settings", "customization_marquee_text", server_default=CUSTOMIZATION_TEXT)


def downgrade() -> None:
    op.alter_column("store_settings", "header_text_1", server_default="Handcrafted in Chennai")
    op.alter_column("store_settings", "header_text_2", server_default="Free monogramming")
    op.alter_column("store_settings", "customization_marquee_text", server_default="Made for you. Stitched by hand.")
