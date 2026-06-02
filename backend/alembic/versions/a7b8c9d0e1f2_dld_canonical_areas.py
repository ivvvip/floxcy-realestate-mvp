"""dld_canonical_areas — single source of truth for DLD area names.

Built by scripts/extract_canonical_areas.py from the raw CSV exports.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-02 14:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_canonical_areas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("area_name", sa.String(255), nullable=False),          # display
        sa.Column("area_name_upper", sa.String(255), nullable=False),    # join key
        sa.Column("area_name_slug", sa.String(255), nullable=False),     # URL
        sa.Column("area_name_ar", sa.String(255), nullable=True),
        # JSON array of source dataset labels: ['transactions','rents','lands']
        sa.Column("source_datasets", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("first_seen_year", sa.Integer, nullable=True),
        sa.Column("occurrence_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("area_name_upper", name="uq_dld_canonical_areas_upper"),
        sa.UniqueConstraint("area_name_slug", name="uq_dld_canonical_areas_slug"),
    )
    op.create_index("ix_dld_canonical_areas_area_name", "dld_canonical_areas", ["area_name"])


def downgrade() -> None:
    op.drop_index("ix_dld_canonical_areas_area_name", table_name="dld_canonical_areas")
    op.drop_table("dld_canonical_areas")
