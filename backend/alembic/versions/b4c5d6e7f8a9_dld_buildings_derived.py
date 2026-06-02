"""Derived buildings dimension from Ejari rent contracts.

The official dld_buildings table only carries 47 distinct (project_name, area)
identities — DLD's published buildings CSV is keyed at master-project
granularity, not per-tower. The rent registry, by contrast, has thousands
of distinct project_name_en values like "SIRAJ TOWER" / "ORBIT RESIDENCES BY
JEWEL 2" that *are* per-building.

This migration adds a synthetic building dimension built from the rent
stream itself, plus a parallel FK on dld_building_rent_history so each
contract-history aggregate can attribute to the synthetic building.

Tables:
  dld_buildings_derived — per (project_name_en, dld_area_id) building entity
                          extracted from rents_2021_2026.csv, filtered to
                          building_name_type in (real_building, sub_project)

Columns added to dld_building_rent_history:
  dld_buildings_derived_id  — FK to dld_buildings_derived.id (nullable;
                              populated when the rent group matches a
                              derived building)

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-06-02 10:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_buildings_derived",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_name_en", sa.String(255), nullable=False),
        sa.Column("project_name_slug", sa.String(255), nullable=False),
        sa.Column("master_project_en", sa.String(255), nullable=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("area_name_en", sa.String(255), nullable=True),
        sa.Column("contract_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_annual_rent", sa.Numeric(14, 2), nullable=True),
        sa.Column("first_seen_year", sa.Integer, nullable=True),
        sa.Column("last_seen_year", sa.Integer, nullable=True),
        sa.Column(
            "data_source",
            sa.String(32),
            nullable=False,
            server_default="ejari_derived",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "project_name_en", "dld_area_id",
            name="uq_dld_buildings_derived_name_area",
        ),
    )
    op.create_index(
        "ix_dld_buildings_derived_slug",
        "dld_buildings_derived",
        ["project_name_slug"],
    )
    op.create_index(
        "ix_dld_buildings_derived_contracts",
        "dld_buildings_derived",
        ["contract_count"],
    )

    # Parallel FK on building rent history so a history row can link to the
    # synthetic building instead of the official one. Both columns coexist —
    # the historical ETL now populates dld_buildings_derived_id; the old
    # dld_building_id remains for back-compat with previously-matched rows.
    op.add_column(
        "dld_building_rent_history",
        sa.Column(
            "dld_buildings_derived_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_buildings_derived.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_dld_brh_derived_id",
        "dld_building_rent_history",
        ["dld_buildings_derived_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_dld_brh_derived_id", table_name="dld_building_rent_history")
    op.drop_column("dld_building_rent_history", "dld_buildings_derived_id")

    op.drop_index("ix_dld_buildings_derived_contracts", table_name="dld_buildings_derived")
    op.drop_index("ix_dld_buildings_derived_slug", table_name="dld_buildings_derived")
    op.drop_table("dld_buildings_derived")
