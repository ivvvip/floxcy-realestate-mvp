"""Drop seeded market_snapshots table (Phase 1 — World B retired).

All readers were migrated to real DLD tables; no code references this table
(the ORM model + dead functions were removed in the same change). The seeded
840 rows ("Aggregated public sources Q1 2026") are intentionally discarded —
DLD is the only source of truth now. The curated `areas` table is KEPT (it
holds identity/metadata + the UUIDs that area URLs and dld_areas.curated_area_id
depend on).

Revision ID: d1e2f3a4b5c6
Revises: c1d2e3f4a5b6
Create Date: 2026-06-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("market_snapshots")


def downgrade() -> None:
    # Recreate the schema shell only — the seeded data is not recoverable.
    op.create_table(
        "market_snapshots",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("area_id", sa.UUID(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("avg_sale_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("avg_price_per_sqft", sa.Numeric(10, 2), nullable=False),
        sa.Column("avg_annual_rent", sa.Numeric(15, 2), nullable=False),
        sa.Column("rental_yield", sa.Numeric(5, 2), nullable=False),
        sa.Column("occupancy_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("appreciation_1y", sa.Numeric(5, 2), nullable=True),
        sa.Column("appreciation_3y", sa.Numeric(5, 2), nullable=True),
        sa.Column("transaction_volume", sa.Integer(), nullable=True),
        sa.Column("demand_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("risk_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("investment_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("data_source", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["area_id"], ["areas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_market_snapshots_area_id", "market_snapshots", ["area_id"])
