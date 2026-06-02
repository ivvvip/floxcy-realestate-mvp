"""Add GeoJSON polygon column on dld_canonical_areas.

Populated by scripts/overpass_geocoding.py from OSM Overpass API admin
boundaries. Polygon is GeoJSON: {"type":"Polygon","coordinates":[[[lon,lat],...]]}
or {"type":"MultiPolygon", ...} for areas with multiple disjoint pieces.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-02 18:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dld_canonical_areas",
        sa.Column("polygon", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dld_canonical_areas", "polygon")
