"""dld_building_osm_coords table + lat/lon/osm_verified on dld_buildings_derived.

Backs the OSM Overpass building match. The new table is the authoritative
join (one row per matched DLD building); the three denormalised columns on
dld_buildings_derived are a fast-path for list endpoints / map markers so
we don't have to JOIN on every render.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-06-03 17:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_building_osm_coords",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "building_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_buildings_derived.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("dld_name", sa.String(255), nullable=False),
        sa.Column("osm_name", sa.String(255), nullable=False),
        sa.Column("lat", sa.Numeric(10, 7), nullable=False),
        sa.Column("lon", sa.Numeric(10, 7), nullable=False),
        sa.Column("osm_id", sa.BigInteger, nullable=False),
        sa.Column("osm_kind", sa.String(16), nullable=True),  # way / relation
        sa.Column("match_type", sa.String(8), nullable=False),  # exact / fuzzy
        sa.Column("match_ratio", sa.Numeric(4, 3), nullable=False),
        sa.Column("floors", sa.Integer, nullable=True),
        sa.Column("building_type", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("building_id", name="uq_dld_building_osm_coords_building"),
    )
    op.create_index(
        "ix_dld_building_osm_coords_building_id",
        "dld_building_osm_coords",
        ["building_id"],
    )
    op.create_index(
        "ix_dld_building_osm_coords_osm_id",
        "dld_building_osm_coords",
        ["osm_id"],
    )

    op.add_column(
        "dld_buildings_derived",
        sa.Column("lat", sa.Numeric(10, 7), nullable=True),
    )
    op.add_column(
        "dld_buildings_derived",
        sa.Column("lon", sa.Numeric(10, 7), nullable=True),
    )
    op.add_column(
        "dld_buildings_derived",
        sa.Column(
            "osm_verified",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("dld_buildings_derived", "osm_verified")
    op.drop_column("dld_buildings_derived", "lon")
    op.drop_column("dld_buildings_derived", "lat")
    op.drop_index(
        "ix_dld_building_osm_coords_osm_id", table_name="dld_building_osm_coords"
    )
    op.drop_index(
        "ix_dld_building_osm_coords_building_id", table_name="dld_building_osm_coords"
    )
    op.drop_table("dld_building_osm_coords")
