"""Add 10y appreciation + CAGR columns to dld_area_appreciation.

Backs the 2009→2026 price-history backfill — with 17 years of data the
10y window starts to carry real signal (covers a full GFC-to-recovery
cycle). Columns are nullable; areas without 10y of history leave them
null.

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-06-03 15:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dld_area_appreciation",
        sa.Column("appreciation_10y_pct", sa.Numeric(8, 2), nullable=True),
    )
    op.add_column(
        "dld_area_appreciation",
        sa.Column("cagr_10y_pct", sa.Numeric(8, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dld_area_appreciation", "cagr_10y_pct")
    op.drop_column("dld_area_appreciation", "appreciation_10y_pct")
