"""Coordinates on dld_canonical_areas.

Source-tracked geocoding: lat/lng/bbox + which source produced them
(curated areas table OR OpenStreetMap Nominatim) + confidence tier.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-02 17:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("dld_canonical_areas", sa.Column("latitude", sa.Float, nullable=True))
    op.add_column("dld_canonical_areas", sa.Column("longitude", sa.Float, nullable=True))
    op.add_column("dld_canonical_areas", sa.Column("bbox_north", sa.Float, nullable=True))
    op.add_column("dld_canonical_areas", sa.Column("bbox_south", sa.Float, nullable=True))
    op.add_column("dld_canonical_areas", sa.Column("bbox_east", sa.Float, nullable=True))
    op.add_column("dld_canonical_areas", sa.Column("bbox_west", sa.Float, nullable=True))
    op.add_column(
        "dld_canonical_areas",
        sa.Column("coords_source", sa.String(32), nullable=True),
    )
    op.add_column(
        "dld_canonical_areas",
        sa.Column("coords_confidence", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dld_canonical_areas", "coords_confidence")
    op.drop_column("dld_canonical_areas", "coords_source")
    op.drop_column("dld_canonical_areas", "bbox_west")
    op.drop_column("dld_canonical_areas", "bbox_east")
    op.drop_column("dld_canonical_areas", "bbox_south")
    op.drop_column("dld_canonical_areas", "bbox_north")
    op.drop_column("dld_canonical_areas", "longitude")
    op.drop_column("dld_canonical_areas", "latitude")
