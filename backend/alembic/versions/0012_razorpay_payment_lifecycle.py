"""Track Razorpay payment failures and refunds.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_payments_provider_order_id", "payments", type_="unique")
    op.create_index("ix_payments_provider_order_id", "payments", ["provider_order_id"], unique=False)
    op.add_column("payments", sa.Column("failure_source", sa.String(length=24), nullable=True))
    op.add_column("payments", sa.Column("refund_id", sa.String(length=64), nullable=True))
    op.add_column("payments", sa.Column("refund_status", sa.String(length=20), nullable=True))
    op.add_column("payments", sa.Column("refund_amount_paise", sa.BigInteger(), nullable=True))
    op.add_column("payments", sa.Column("refund_error", sa.String(length=500), nullable=True))
    op.create_unique_constraint("uq_payments_refund_id", "payments", ["refund_id"])

    op.drop_constraint(op.f("ck_payments_provider_valid"), "payments", type_="check")
    op.drop_constraint(op.f("ck_payments_status_valid"), "payments", type_="check")
    op.execute("UPDATE payments SET provider = 'legacy' WHERE provider = 'mock'")
    op.create_check_constraint(
        op.f("ck_payments_provider_valid"), "payments", "provider IN ('legacy', 'razorpay')"
    )
    op.create_check_constraint(
        op.f("ck_payments_status_valid"),
        "payments",
        "status IN ('created', 'authorized', 'captured', 'failed', 'refunded')",
    )
    op.create_check_constraint(
        op.f("ck_payments_failure_source_valid"),
        "payments",
        "failure_source IS NULL OR failure_source IN "
        "('checkout_report', 'razorpay_api', 'razorpay_webhook')",
    )
    op.create_check_constraint(
        op.f("ck_payments_refund_status_valid"),
        "payments",
        "refund_status IS NULL OR refund_status IN ('requested', 'pending', 'processed', 'failed', 'unknown')",
    )
    op.create_check_constraint(
        op.f("ck_payments_refund_amount_valid"),
        "payments",
        "refund_amount_paise IS NULL OR "
        "(refund_amount_paise > 0 AND refund_amount_paise <= amount_paise)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_payments_refund_amount_valid"), "payments", type_="check")
    op.drop_constraint(op.f("ck_payments_refund_status_valid"), "payments", type_="check")
    op.drop_constraint(op.f("ck_payments_failure_source_valid"), "payments", type_="check")
    op.drop_constraint(op.f("ck_payments_provider_valid"), "payments", type_="check")
    op.drop_constraint(op.f("ck_payments_status_valid"), "payments", type_="check")
    op.execute("UPDATE payments SET status = 'created' WHERE status = 'authorized'")
    op.execute("UPDATE payments SET provider = 'mock' WHERE provider = 'legacy'")
    op.create_check_constraint(
        op.f("ck_payments_provider_valid"), "payments", "provider IN ('mock', 'razorpay')"
    )
    op.create_check_constraint(
        op.f("ck_payments_status_valid"),
        "payments",
        "status IN ('created', 'captured', 'failed', 'refunded')",
    )
    op.drop_constraint("uq_payments_refund_id", "payments", type_="unique")
    op.drop_column("payments", "refund_error")
    op.drop_column("payments", "refund_amount_paise")
    op.drop_column("payments", "refund_status")
    op.drop_column("payments", "refund_id")
    op.drop_column("payments", "failure_source")
    op.drop_index("ix_payments_provider_order_id", table_name="payments")
    op.create_unique_constraint("uq_payments_provider_order_id", "payments", ["provider_order_id"])
