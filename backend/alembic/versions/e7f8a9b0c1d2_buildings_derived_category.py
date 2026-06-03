"""property_category on dld_buildings_derived for the 5-tab buildings UI.

Adds a single column so the buildings index can filter by category
(apartment / villa / hotel_apt / labor_camp / office / retail / warehouse /
whole_building / other) at the SQL layer — driven by the same classifier
we already use to route rent rows.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-06-03 04:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dld_buildings_derived",
        sa.Column("property_category", sa.String(32), nullable=True),
    )
    op.create_index(
        "ix_dld_buildings_derived_category",
        "dld_buildings_derived",
        ["property_category"],
    )


def downgrade() -> None:
    op.drop_index("ix_dld_buildings_derived_category", table_name="dld_buildings_derived")
    op.drop_column("dld_buildings_derived", "property_category")
