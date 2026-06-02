"""Rent ETL rebuild: category-aware schema + per-building history + lease expiry.

This single revision lands the schema for the full Scope B rebuild + the
URGENT FIX category split + the Availability Tracker feature. Nothing here
was applied to prod before the rebuild, so it's one coherent revision
rather than a chain.

Changes on existing tables
--------------------------
dld_rent_benchmarks:
  + property_usage         VARCHAR(32)  NOT NULL DEFAULT 'Residential'
  + property_category      VARCHAR(32)  NOT NULL DEFAULT 'apartment'
  + is_bulk_contract       BOOLEAN      NOT NULL DEFAULT FALSE
  ~ UNIQUE key now includes property_category so apartment/villa/hotel_apt
    coexist for the same (area, sub_type, size_band, period).

dld_rent_history (residential apartment+villa+hotel_apt only):
  + person_contract_count     INT NOT NULL DEFAULT 0
  + authority_contract_count  INT NOT NULL DEFAULT 0

New tables
----------
dld_building_rent_history     — per-(building, year) Person residential rents
dld_labor_camp_stats          — per-(area, year) bulk labor-camp aggregates
dld_commercial_benchmarks     — per-(area, category, year) office/retail/warehouse
dld_lease_expiry_forecast     — per-(area, project, sub_type, expiry_month)
                                 forward-looking availability signal

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-02 08:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- dld_rent_benchmarks: property_usage + property_category + bulk flag ----
    op.add_column(
        "dld_rent_benchmarks",
        sa.Column("property_usage", sa.String(32), nullable=False,
                  server_default="Residential"),
    )
    op.add_column(
        "dld_rent_benchmarks",
        sa.Column("property_category", sa.String(32), nullable=False,
                  server_default="apartment"),
    )
    op.add_column(
        "dld_rent_benchmarks",
        sa.Column("is_bulk_contract", sa.Boolean, nullable=False,
                  server_default=sa.false()),
    )
    op.drop_constraint("uq_dld_rent_benchmark_key", "dld_rent_benchmarks", type_="unique")
    op.create_unique_constraint(
        "uq_dld_rent_benchmark_key",
        "dld_rent_benchmarks",
        ["dld_area_id", "prop_sub_type", "size_band", "period",
         "property_usage", "property_category"],
    )

    # ---- dld_rent_history: tenant audit counts ----
    op.add_column(
        "dld_rent_history",
        sa.Column("person_contract_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "dld_rent_history",
        sa.Column("authority_contract_count", sa.Integer, nullable=False, server_default="0"),
    )

    # ---- dld_building_rent_history ----
    op.create_table(
        "dld_building_rent_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_building_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_buildings.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column("project_number", sa.String(64), nullable=True, index=True),
        sa.Column("project_name", sa.String(255), nullable=True),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("avg_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("median_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("new_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("renew_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("person_contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("authority_contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_dld_building_rent_history_year",
        "dld_building_rent_history",
        ["year"],
    )
    op.create_index(
        "ix_dld_building_rent_history_area_year",
        "dld_building_rent_history",
        ["area_name_norm", "year"],
    )
    op.create_index(
        "uq_dld_brh_pnumber_year",
        "dld_building_rent_history",
        ["project_number", "year"],
        unique=True,
        postgresql_where=sa.text("project_number IS NOT NULL"),
    )
    op.create_index(
        "uq_dld_brh_pname_area_year",
        "dld_building_rent_history",
        ["project_name", "area_name_norm", "year"],
        unique=True,
        postgresql_where=sa.text("project_number IS NULL AND project_name IS NOT NULL"),
    )

    # ---- dld_labor_camp_stats ----
    # Per (area, year). avg_rooms_per_contract is parsed from
    # ejari_property_sub_type_en when possible; left NULL otherwise.
    op.create_table(
        "dld_labor_camp_stats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_rooms_per_contract", sa.Numeric(8, 2), nullable=True),
        sa.Column("avg_annual_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("median_annual_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("total_annual_income", sa.Numeric(18, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("area_name_norm", "year", name="uq_dld_labor_camp_stats_area_year"),
    )
    op.create_index(
        "ix_dld_labor_camp_stats_year",
        "dld_labor_camp_stats",
        ["year"],
    )

    # ---- dld_commercial_benchmarks ----
    # Per (area, property_category, year) for office/retail/warehouse.
    op.create_table(
        "dld_commercial_benchmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("property_category", sa.String(32), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("avg_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("median_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("median_rent_per_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("sample_size", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "area_name_norm", "property_category", "year",
            name="uq_dld_commercial_benchmarks_key",
        ),
    )
    op.create_index(
        "ix_dld_commercial_benchmarks_year",
        "dld_commercial_benchmarks",
        ["year"],
    )

    # ---- dld_lease_expiry_forecast ----
    # Forward-looking availability signal: per (area, project_name, sub_type,
    # expiry_month), how many Person residential contracts END in that month.
    # estimated_available = contract_count × 0.39 (blended non-renewal rate);
    # renewal_probability is the bucket-level blend across Person + Renew
    # (0.61) vs Person + New (0.45) inputs.
    op.create_table(
        "dld_lease_expiry_forecast",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("project_name_en", sa.String(255), nullable=True),
        sa.Column("property_sub_type", sa.String(32), nullable=False),
        sa.Column("expiry_month", sa.String(7), nullable=False),  # 'YYYY-MM'
        sa.Column("contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("estimated_available", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_last_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("renewal_probability", sa.Numeric(5, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_dld_lease_expiry_area_month",
        "dld_lease_expiry_forecast",
        ["area_name_norm", "expiry_month"],
    )
    op.create_index(
        "ix_dld_lease_expiry_month",
        "dld_lease_expiry_forecast",
        ["expiry_month"],
    )
    op.create_index(
        "uq_dld_lease_expiry_key",
        "dld_lease_expiry_forecast",
        ["area_name_norm", "project_name_en", "property_sub_type", "expiry_month"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_dld_lease_expiry_key", table_name="dld_lease_expiry_forecast")
    op.drop_index("ix_dld_lease_expiry_month", table_name="dld_lease_expiry_forecast")
    op.drop_index("ix_dld_lease_expiry_area_month", table_name="dld_lease_expiry_forecast")
    op.drop_table("dld_lease_expiry_forecast")

    op.drop_index("ix_dld_commercial_benchmarks_year", table_name="dld_commercial_benchmarks")
    op.drop_table("dld_commercial_benchmarks")

    op.drop_index("ix_dld_labor_camp_stats_year", table_name="dld_labor_camp_stats")
    op.drop_table("dld_labor_camp_stats")

    op.drop_index("uq_dld_brh_pname_area_year", table_name="dld_building_rent_history")
    op.drop_index("uq_dld_brh_pnumber_year", table_name="dld_building_rent_history")
    op.drop_index("ix_dld_building_rent_history_area_year", table_name="dld_building_rent_history")
    op.drop_index("ix_dld_building_rent_history_year", table_name="dld_building_rent_history")
    op.drop_table("dld_building_rent_history")

    op.drop_column("dld_rent_history", "authority_contract_count")
    op.drop_column("dld_rent_history", "person_contract_count")

    op.drop_constraint("uq_dld_rent_benchmark_key", "dld_rent_benchmarks", type_="unique")
    op.create_unique_constraint(
        "uq_dld_rent_benchmark_key",
        "dld_rent_benchmarks",
        ["dld_area_id", "prop_sub_type", "size_band", "period"],
    )
    op.drop_column("dld_rent_benchmarks", "is_bulk_contract")
    op.drop_column("dld_rent_benchmarks", "property_category")
    op.drop_column("dld_rent_benchmarks", "property_usage")
