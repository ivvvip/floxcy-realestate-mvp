"""Transactions ETL rebuild — building-sales / bedroom-benchmarks /
gift-transfers + parking_pct on area_metrics.

Backs the rewrite of etl_dld_history.py from a single-track price-history
ETL into a multi-track pass that produces:

  dld_price_history          (existing — now fed by an explicit
                              SALE_PROCEDURES allowlist)
  dld_area_appreciation      (existing — auto-rederived)
  dld_buildings_sales        (NEW — per-(building_name_en, area_id)
                              sales benchmarks, parallel to the rents-side
                              dld_buildings_derived)
  dld_bedroom_benchmarks     (NEW — per-(area, bedroom_type, reg_type, year)
                              sale price benchmarks from rooms_en)
  dld_gift_transfers         (NEW — Gifts/Grants stored separately so they
                              never contaminate price math)

Plus a parking_pct column on dld_area_metrics so the existing area view
can surface the parking-share signal from has_parking.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-06-03 03:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- dld_area_metrics: parking_pct ----
    op.add_column(
        "dld_area_metrics",
        sa.Column("parking_pct", sa.Numeric(5, 2), nullable=True),
    )

    # ---- dld_buildings_sales ----
    op.create_table(
        "dld_buildings_sales",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("building_name_en", sa.String(255), nullable=False),
        sa.Column("building_name_slug", sa.String(255), nullable=False),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("area_name_en", sa.String(255), nullable=True),
        sa.Column("master_project_en", sa.String(255), nullable=True),
        sa.Column("total_transactions", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_sale_price_ready", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_sale_price_offplan", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_ppsf_ready", sa.Numeric(12, 2), nullable=True),
        sa.Column("avg_ppsf_offplan", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_sale_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("min_sale_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("max_sale_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("years_covered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("first_seen_year", sa.Integer, nullable=True),
        sa.Column("last_seen_year", sa.Integer, nullable=True),
        sa.Column("last_transaction_date", sa.Date, nullable=True),
        sa.Column("parking_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("bulk_transaction_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "building_name_en", "dld_area_id",
            name="uq_dld_buildings_sales_name_area",
        ),
    )
    op.create_index(
        "ix_dld_buildings_sales_slug",
        "dld_buildings_sales",
        ["building_name_slug"],
    )
    op.create_index(
        "ix_dld_buildings_sales_txn_count",
        "dld_buildings_sales",
        ["total_transactions"],
    )

    # ---- dld_bedroom_benchmarks ----
    op.create_table(
        "dld_bedroom_benchmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("bedroom_type", sa.String(16), nullable=False),  # Studio/1BR/.../5BR+
        sa.Column("reg_type", sa.String(16), nullable=False),       # ready / off_plan
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("avg_price_aed", sa.Numeric(14, 2), nullable=True),
        sa.Column("median_price_aed", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_ppsf", sa.Numeric(12, 2), nullable=True),
        sa.Column("transaction_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "area_name_norm", "bedroom_type", "reg_type", "year",
            name="uq_dld_bedroom_benchmarks_key",
        ),
    )
    op.create_index(
        "ix_dld_bedroom_benchmarks_area_year",
        "dld_bedroom_benchmarks",
        ["area_name_norm", "year"],
    )

    # ---- dld_gift_transfers ----
    # Aggregated per (area, year) since per-row storage would balloon and the
    # interesting signal is "how many ownership transfers without a sale
    # happened here this year" rather than each individual transfer.
    op.create_table(
        "dld_gift_transfers",
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
        sa.Column("transfer_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "area_name_norm", "year",
            name="uq_dld_gift_transfers_area_year",
        ),
    )


def downgrade() -> None:
    op.drop_table("dld_gift_transfers")
    op.drop_index("ix_dld_bedroom_benchmarks_area_year", table_name="dld_bedroom_benchmarks")
    op.drop_table("dld_bedroom_benchmarks")
    op.drop_index("ix_dld_buildings_sales_txn_count", table_name="dld_buildings_sales")
    op.drop_index("ix_dld_buildings_sales_slug", table_name="dld_buildings_sales")
    op.drop_table("dld_buildings_sales")
    op.drop_column("dld_area_metrics", "parking_pct")
