"""Add Spuni Cash conversion and tiered wallet rewards."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "store_settings",
        sa.Column("wallet_cash_value_paise", sa.BigInteger(), server_default="100", nullable=False),
    )
    op.add_column(
        "store_settings",
        sa.Column("wallet_tier_1_limit_paise", sa.BigInteger(), server_default="200000", nullable=False),
    )
    op.add_column(
        "store_settings",
        sa.Column("wallet_tier_2_limit_paise", sa.BigInteger(), server_default="500000", nullable=False),
    )
    op.add_column(
        "store_settings",
        sa.Column("wallet_tier_3_limit_paise", sa.BigInteger(), server_default="1000000", nullable=False),
    )
    for column, default in (
        ("wallet_tier_1_percent", "2"),
        ("wallet_tier_2_percent", "3"),
        ("wallet_tier_3_percent", "4"),
        ("wallet_tier_4_percent", "5"),
    ):
        op.add_column("store_settings", sa.Column(column, sa.Integer(), server_default=default, nullable=False))
    op.create_check_constraint(
        op.f("ck_store_settings_cash_value_positive"), "store_settings", "wallet_cash_value_paise >= 100"
    )
    op.create_check_constraint(
        op.f("ck_store_settings_tier_1_limit_positive"), "store_settings", "wallet_tier_1_limit_paise > 0"
    )
    op.create_check_constraint(
        op.f("ck_store_settings_tier_2_limit_order"),
        "store_settings",
        "wallet_tier_2_limit_paise > wallet_tier_1_limit_paise",
    )
    op.create_check_constraint(
        op.f("ck_store_settings_tier_3_limit_order"),
        "store_settings",
        "wallet_tier_3_limit_paise > wallet_tier_2_limit_paise",
    )
    op.create_check_constraint(
        op.f("ck_store_settings_tier_percent_range"),
        "store_settings",
        "wallet_tier_1_percent BETWEEN 0 AND 50 AND wallet_tier_2_percent BETWEEN 0 AND 50 "
        "AND wallet_tier_3_percent BETWEEN 0 AND 50 AND wallet_tier_4_percent BETWEEN 0 AND 50",
    )


def downgrade() -> None:
    op.drop_constraint("ck_store_settings_tier_percent_range", "store_settings", type_="check")
    op.drop_constraint("ck_store_settings_tier_3_limit_order", "store_settings", type_="check")
    op.drop_constraint("ck_store_settings_tier_2_limit_order", "store_settings", type_="check")
    op.drop_constraint("ck_store_settings_tier_1_limit_positive", "store_settings", type_="check")
    op.drop_constraint("ck_store_settings_cash_value_positive", "store_settings", type_="check")
    op.drop_column("store_settings", "wallet_tier_4_percent")
    op.drop_column("store_settings", "wallet_tier_3_percent")
    op.drop_column("store_settings", "wallet_tier_2_percent")
    op.drop_column("store_settings", "wallet_tier_1_percent")
    op.drop_column("store_settings", "wallet_tier_3_limit_paise")
    op.drop_column("store_settings", "wallet_tier_2_limit_paise")
    op.drop_column("store_settings", "wallet_tier_1_limit_paise")
    op.drop_column("store_settings", "wallet_cash_value_paise")
