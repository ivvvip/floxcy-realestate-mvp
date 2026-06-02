"""DLD rent + yield history tables.

Populated by scripts/etl_dld_rent_history.py from the 2021–2026 rents
export. Yield is derived in-script as a JOIN over price_history.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-02 13:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_rent_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("avg_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("median_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("new_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("renew_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("renewal_rate_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("area_name_norm", "year", name="uq_dld_rent_history_area_year"),
    )
    op.create_index("ix_dld_rent_history_area_name_norm", "dld_rent_history", ["area_name_norm"])
    op.create_index("ix_dld_rent_history_year", "dld_rent_history", ["year"])

    op.create_table(
        "dld_yield_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        # gross_yield_pct = avg_rent_per_sqft / avg_ppsf_all × 100 (capped at 25)
        sa.Column("gross_yield_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("sale_ppsf", sa.Numeric(12, 2), nullable=True),
        sa.Column("rent_psf", sa.Numeric(12, 2), nullable=True),
        # YoY delta vs prior year's gross_yield
        sa.Column("yield_delta_yoy_pct", sa.Numeric(8, 2), nullable=True),
        # min(sales_count, contract_count) — quality signal for the join
        sa.Column("sample_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("area_name_norm", "year", name="uq_dld_yield_history_area_year"),
    )
    op.create_index("ix_dld_yield_history_area_name_norm", "dld_yield_history", ["area_name_norm"])
    op.create_index("ix_dld_yield_history_year", "dld_yield_history", ["year"])


def downgrade() -> None:
    op.drop_index("ix_dld_yield_history_year", table_name="dld_yield_history")
    op.drop_index("ix_dld_yield_history_area_name_norm", table_name="dld_yield_history")
    op.drop_table("dld_yield_history")
    op.drop_index("ix_dld_rent_history_year", table_name="dld_rent_history")
    op.drop_index("ix_dld_rent_history_area_name_norm", table_name="dld_rent_history")
    op.drop_table("dld_rent_history")
