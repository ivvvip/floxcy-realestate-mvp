"""Building name classification columns.

Adds the per-building name analysis fields populated by etl_dld.compute_buildings
using scripts/_building_classifier.classify_building_name(). These let the
Building X-Ray surface a truthful identity instead of mis-treating area/
developer/master-project labels as distinct buildings.

Columns:
  building_name_clean  — the best-effort building identity string
  building_name_type   — one of real_building / sub_project / master_project /
                          developer_name / area_name / no_name
  display_name         — pre-rendered user-facing label
  is_identifiable      — true when the type is real_building or sub_project
                          (the only types that should feed building-level
                          rent analytics)

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-06-02 09:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dld_buildings",
        sa.Column("building_name_clean", sa.String(255), nullable=True),
    )
    op.add_column(
        "dld_buildings",
        sa.Column("building_name_type", sa.String(32), nullable=True),
    )
    op.add_column(
        "dld_buildings",
        sa.Column("display_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "dld_buildings",
        sa.Column(
            "is_identifiable",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_dld_buildings_is_identifiable",
        "dld_buildings",
        ["is_identifiable"],
    )


def downgrade() -> None:
    op.drop_index("ix_dld_buildings_is_identifiable", table_name="dld_buildings")
    op.drop_column("dld_buildings", "is_identifiable")
    op.drop_column("dld_buildings", "display_name")
    op.drop_column("dld_buildings", "building_name_type")
    op.drop_column("dld_buildings", "building_name_clean")
