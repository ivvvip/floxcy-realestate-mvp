"""dld_area_population table — Digital Dubai 2024 official population data.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-03 14:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_area_population",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("community_code", sa.Integer, nullable=False),
        sa.Column("area_name_en", sa.String(255), nullable=False),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("area_name_ar", sa.String(255), nullable=True),
        sa.Column("sector", sa.Integer, nullable=False),
        sa.Column("total_population", sa.Integer, nullable=False, server_default="0"),
        sa.Column("area_km2", sa.Numeric(10, 2), nullable=True),
        sa.Column("population_density", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "source", sa.String(64), nullable=False, server_default="Digital Dubai 2024"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("community_code", name="uq_dld_area_population_code"),
    )
    op.create_index(
        "ix_dld_area_population_community_code",
        "dld_area_population",
        ["community_code"],
    )
    op.create_index(
        "ix_dld_area_population_area_name_en",
        "dld_area_population",
        ["area_name_en"],
    )
    op.create_index(
        "ix_dld_area_population_area_name_norm",
        "dld_area_population",
        ["area_name_norm"],
    )
    op.create_index(
        "ix_dld_area_population_sector",
        "dld_area_population",
        ["sector"],
    )


def downgrade() -> None:
    op.drop_index("ix_dld_area_population_sector", table_name="dld_area_population")
    op.drop_index(
        "ix_dld_area_population_area_name_norm", table_name="dld_area_population"
    )
    op.drop_index(
        "ix_dld_area_population_area_name_en", table_name="dld_area_population"
    )
    op.drop_index(
        "ix_dld_area_population_community_code", table_name="dld_area_population"
    )
    op.drop_table("dld_area_population")
