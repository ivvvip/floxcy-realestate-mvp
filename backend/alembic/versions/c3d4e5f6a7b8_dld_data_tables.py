"""DLD data tables — areas, area metrics, buildings, RERA brokers, rent benchmarks.

All tables are derived from Dubai Land Department CSV snapshots. Purely additive;
no edits to existing tables. dld_areas.curated_area_id optionally links to the
curated areas table.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-01 16:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- dld_areas ----
    op.create_table(
        "dld_areas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name_norm", sa.String(255), nullable=False, unique=True),
        sa.Column("name_display", sa.String(255), nullable=False),
        sa.Column(
            "curated_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("areas.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("txn_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rent_count_2026", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rent_count_2025", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("building_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("land_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dld_areas_name_norm", "dld_areas", ["name_norm"], unique=True)
    op.create_index("ix_dld_areas_curated_area_id", "dld_areas", ["curated_area_id"])

    # ---- dld_area_metrics ----
    op.create_table(
        "dld_area_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(32), nullable=False, server_default="2026-ytd"),
        sa.Column("avg_price_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_price_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("sales_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("median_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("rent_count_2026", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rental_yield_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("rent_growth_yoy_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("dld_area_id", "period", name="uq_dld_area_metrics_area_period"),
    )
    op.create_index("ix_dld_area_metrics_dld_area_id", "dld_area_metrics", ["dld_area_id"])

    # ---- dld_buildings ----
    op.create_table(
        "dld_buildings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("project_number", sa.String(64), nullable=True),
        sa.Column("project_name", sa.String(255), nullable=True),
        sa.Column("master_project", sa.String(255), nullable=True),
        sa.Column("zone", sa.String(128), nullable=True),
        sa.Column("prop_sub_type", sa.String(128), nullable=True),
        sa.Column("land_type", sa.String(128), nullable=True),
        sa.Column("actual_area", sa.Float(), nullable=True),
        sa.Column("built_up_area", sa.Float(), nullable=True),
        sa.Column("flats", sa.Integer(), nullable=True),
        sa.Column("shops", sa.Integer(), nullable=True),
        sa.Column("offices", sa.Integer(), nullable=True),
        sa.Column("floors", sa.Integer(), nullable=True),
        sa.Column("bld_levels", sa.Integer(), nullable=True),
        sa.Column("elevators", sa.Integer(), nullable=True),
        sa.Column("swimming_pools", sa.Integer(), nullable=True),
        sa.Column("car_parks", sa.Integer(), nullable=True),
        sa.Column("is_freehold", sa.Boolean(), nullable=True),
        sa.Column("is_offplan", sa.Boolean(), nullable=True),
        sa.Column("creation_date", sa.DateTime(), nullable=True),
        sa.Column("avg_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("active_rent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("occupancy_proxy_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dld_buildings_dld_area_id", "dld_buildings", ["dld_area_id"])
    op.create_index("ix_dld_buildings_project_number", "dld_buildings", ["project_number"])

    # ---- dld_rera_brokers ----
    op.create_table(
        "dld_rera_brokers",
        sa.Column("broker_number", sa.String(32), primary_key=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("gender", sa.String(16), nullable=True),
        sa.Column("license_start_date", sa.Date(), nullable=True),
        sa.Column("license_end_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("webpage", sa.String(512), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("fax", sa.String(64), nullable=True),
        sa.Column("real_estate_number", sa.String(32), nullable=True),
        sa.Column("real_estate_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dld_rera_brokers_full_name", "dld_rera_brokers", ["full_name"])
    op.create_index("ix_dld_rera_brokers_license_end_date", "dld_rera_brokers", ["license_end_date"])
    op.create_index("ix_dld_rera_brokers_is_active", "dld_rera_brokers", ["is_active"])

    # ---- dld_rent_benchmarks ----
    op.create_table(
        "dld_rent_benchmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("prop_sub_type", sa.String(64), nullable=False),
        sa.Column("size_band", sa.String(32), nullable=False),
        sa.Column("period", sa.String(32), nullable=False, server_default="2026"),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("p10_annual_rent", sa.Numeric(14, 2), nullable=False),
        sa.Column("p25_annual_rent", sa.Numeric(14, 2), nullable=False),
        sa.Column("median_annual_rent", sa.Numeric(14, 2), nullable=False),
        sa.Column("p75_annual_rent", sa.Numeric(14, 2), nullable=False),
        sa.Column("p90_annual_rent", sa.Numeric(14, 2), nullable=False),
        sa.Column("p25_rent_per_sqft", sa.Numeric(12, 2), nullable=False),
        sa.Column("median_rent_per_sqft", sa.Numeric(12, 2), nullable=False),
        sa.Column("p75_rent_per_sqft", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "dld_area_id", "prop_sub_type", "size_band", "period",
            name="uq_dld_rent_benchmark_key",
        ),
    )
    op.create_index("ix_dld_rent_benchmarks_dld_area_id", "dld_rent_benchmarks", ["dld_area_id"])


def downgrade() -> None:
    op.drop_table("dld_rent_benchmarks")
    op.drop_table("dld_rera_brokers")
    op.drop_table("dld_buildings")
    op.drop_table("dld_area_metrics")
    op.drop_table("dld_areas")
