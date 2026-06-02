"""DLD price history + appreciation tables.

Powers the 5-year per-area price chart and CAGR/appreciation overlays.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-02 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_price_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("avg_ppsf_ready", sa.Numeric(12, 2), nullable=True),
        sa.Column("avg_ppsf_offplan", sa.Numeric(12, 2), nullable=True),
        sa.Column("avg_ppsf_all", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_ppsf_all", sa.Numeric(12, 2), nullable=True),
        sa.Column("transaction_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("transaction_count_ready", sa.Integer, nullable=False, server_default="0"),
        sa.Column("transaction_count_offplan", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_value_aed", sa.Numeric(18, 2), nullable=True),
        sa.Column("median_deal_size", sa.Numeric(14, 2), nullable=True),
        sa.Column("offplan_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("area_name_norm", "year", name="uq_dld_price_history_area_year"),
    )
    op.create_index(
        "ix_dld_price_history_area_name_norm",
        "dld_price_history",
        ["area_name_norm"],
    )
    op.create_index(
        "ix_dld_price_history_year",
        "dld_price_history",
        ["year"],
    )

    op.create_table(
        "dld_area_appreciation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False, unique=True),
        sa.Column("base_year", sa.Integer, nullable=False),
        sa.Column("latest_year", sa.Integer, nullable=False),
        sa.Column("appreciation_1y_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("appreciation_3y_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("appreciation_5y_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("cagr_5y_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("years_of_data", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("dld_area_appreciation")
    op.drop_index("ix_dld_price_history_year", table_name="dld_price_history")
    op.drop_index("ix_dld_price_history_area_name_norm", table_name="dld_price_history")
    op.drop_table("dld_price_history")
