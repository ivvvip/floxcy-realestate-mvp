"""DLD land registry (parcel-level) + per-area land summary.

Source: ~/dld-data/land_registry.csv (259,491 parcels, 32 columns).
Populated by scripts/etl_dld_land_registry.py.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-02 16:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_land_registry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("property_id", sa.String(32), nullable=False, index=True),
        sa.Column("area_name_norm", sa.String(255), nullable=False, index=True),
        sa.Column("area_name_en", sa.String(255), nullable=True),
        sa.Column("area_name_ar", sa.String(255), nullable=True),
        sa.Column("zone_id", sa.String(32), nullable=True),
        sa.Column("land_number", sa.String(32), nullable=True),
        sa.Column("land_sub_number", sa.String(32), nullable=True),
        sa.Column("parcel_id", sa.String(32), nullable=True, index=True),
        sa.Column("actual_area_sqm", sa.Numeric(14, 2), nullable=True),
        sa.Column("property_type_en", sa.String(64), nullable=True),
        sa.Column("property_sub_type_en", sa.String(128), nullable=True),
        sa.Column("land_type_en", sa.String(64), nullable=True),
        sa.Column("is_free_hold", sa.Boolean, nullable=True),
        sa.Column("is_registered", sa.Boolean, nullable=True),
        sa.Column("pre_registration_number", sa.String(64), nullable=True),
        sa.Column("project_name_en", sa.String(255), nullable=True),
        sa.Column("master_project_en", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_dld_land_registry_master", "dld_land_registry", ["master_project_en"])

    op.create_table(
        "dld_area_land_summary",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("area_name_norm", sa.String(255), unique=True, nullable=False),
        sa.Column("area_name_display", sa.String(255), nullable=True),
        sa.Column("total_parcels", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_area_sqm", sa.Numeric(18, 2), nullable=True),
        sa.Column("freehold_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("registered_pct", sa.Numeric(5, 2), nullable=True),
        # JSONB: {"Residential": 23.0, "Commercial": 57.0, ...}
        sa.Column(
            "land_type_mix",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        # JSONB: [{"name": "DAMAC HILLS 2", "parcel_count": 14089}, ...]
        sa.Column(
            "top_master_projects",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("dld_area_land_summary")
    op.drop_index("ix_dld_land_registry_master", table_name="dld_land_registry")
    op.drop_table("dld_land_registry")
