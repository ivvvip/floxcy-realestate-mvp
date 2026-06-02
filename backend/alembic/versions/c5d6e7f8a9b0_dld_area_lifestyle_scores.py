"""Per-area lifestyle scores derived from rent stream nearest_* columns.

The rent CSV carries per-row nearest_metro / nearest_mall / nearest_landmark
fields. Aggregated to the area level they give a coarse but data-grounded
lifestyle signal that lives alongside the existing rent/yield/expiry stack.

Columns:
  metro_score       (0-10) — function of distinct metro stations near the area
  mall_score        (0-10) — modal nearest_mall mapped per spec
  landmark_score    (0-10) — modal nearest_landmark mapped per spec
  overall_score     (0-10) — mean of the three component scores
  nearest_*         — the most-frequent value observed in this area
  metro_stations_count — distinct metro stations seen (feeds metro_score)

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-06-03 02:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_area_lifestyle_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dld_area_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dld_areas.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("metro_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("mall_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("landmark_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("overall_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("nearest_metro", sa.String(255), nullable=True),
        sa.Column("nearest_mall", sa.String(255), nullable=True),
        sa.Column("nearest_landmark", sa.String(255), nullable=True),
        sa.Column("metro_stations_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("area_name_norm", name="uq_dld_area_lifestyle_scores_area"),
    )


def downgrade() -> None:
    op.drop_table("dld_area_lifestyle_scores")
