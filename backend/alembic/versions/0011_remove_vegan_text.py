"""replace remaining vegan wording with slaughter-free wording

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-25
"""

from alembic import op


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE store_settings SET "
        "header_text_1 = REPLACE(REPLACE(header_text_1, 'vegan leather', 'slaughter-free leather'), "
        "'Vegan leather', 'Slaughter-free leather'), "
        "header_text_2 = REPLACE(REPLACE(header_text_2, 'vegan leather', 'slaughter-free leather'), "
        "'Vegan leather', 'Slaughter-free leather')"
    )
    op.execute(
        "UPDATE products SET "
        "short_description = REPLACE(REPLACE(short_description, 'vegan leather', 'slaughter-free leather'), "
        "'Vegan leather', 'Slaughter-free leather'), "
        "description = REPLACE(REPLACE(description, 'vegan leather', 'slaughter-free leather'), "
        "'Vegan leather', 'Slaughter-free leather'), "
        "material = REPLACE(REPLACE(material, 'vegan leather', 'slaughter-free leather'), "
        "'Vegan leather', 'Slaughter-free leather'), "
        "meta_description = REPLACE(REPLACE(meta_description, 'vegan leather', 'slaughter-free leather'), "
        "'Vegan leather', 'Slaughter-free leather')"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE store_settings SET "
        "header_text_1 = REPLACE(REPLACE(header_text_1, 'slaughter-free leather', 'vegan leather'), "
        "'Slaughter-free leather', 'Vegan leather'), "
        "header_text_2 = REPLACE(REPLACE(header_text_2, 'slaughter-free leather', 'vegan leather'), "
        "'Slaughter-free leather', 'Vegan leather')"
    )
    op.execute(
        "UPDATE products SET "
        "short_description = REPLACE(REPLACE(short_description, 'slaughter-free leather', 'vegan leather'), "
        "'Slaughter-free leather', 'Vegan leather'), "
        "description = REPLACE(REPLACE(description, 'slaughter-free leather', 'vegan leather'), "
        "'Slaughter-free leather', 'Vegan leather'), "
        "material = REPLACE(REPLACE(material, 'slaughter-free leather', 'vegan leather'), "
        "'Slaughter-free leather', 'Vegan leather'), "
        "meta_description = REPLACE(REPLACE(meta_description, 'slaughter-free leather', 'vegan leather'), "
        "'Slaughter-free leather', 'Vegan leather')"
    )
