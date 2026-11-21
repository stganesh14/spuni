"""add database-backed home page media mapping

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-21
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "store_settings",
        sa.Column("home_media", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("store_settings", "home_media")
