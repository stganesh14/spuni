"""create blog posts for public editorial content

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blog_posts",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("excerpt", sa.String(length=320), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(r"slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'", name="slug_format"),
        sa.CheckConstraint("length(trim(title)) >= 2", name="title_len"),
        sa.CheckConstraint("status IN ('draft', 'published')", name="status_valid"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index(
        "ix_blog_posts_status_published_at", "blog_posts", ["status", "published_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_blog_posts_status_published_at", table_name="blog_posts")
    op.drop_table("blog_posts")
