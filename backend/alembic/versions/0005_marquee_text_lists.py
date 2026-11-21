"""allow multi-line configurable marquee text

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-21
"""

import sqlalchemy as sa
from alembic import op


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("store_settings", "header_text_1", type_=sa.Text(), existing_type=sa.String(length=160))
    op.alter_column("store_settings", "header_text_2", type_=sa.Text(), existing_type=sa.String(length=160))
    op.alter_column("store_settings", "customization_marquee_text", type_=sa.Text(), existing_type=sa.String(length=160))


def downgrade() -> None:
    op.alter_column("store_settings", "header_text_1", type_=sa.String(length=160), existing_type=sa.Text())
    op.alter_column("store_settings", "header_text_2", type_=sa.String(length=160), existing_type=sa.Text())
    op.alter_column("store_settings", "customization_marquee_text", type_=sa.String(length=160), existing_type=sa.Text())
