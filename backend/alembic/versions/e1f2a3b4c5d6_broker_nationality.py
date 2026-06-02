"""Add nationality detection columns on dld_rera_brokers.

Three NULL-able columns populated by scripts/populate_broker_nationality.py
from name patterns. Always estimated, never verified — DLD does not
publish broker nationality data.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-02 14:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dld_rera_brokers",
        sa.Column("detected_nationality", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "dld_rera_brokers",
        sa.Column("detected_language", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "dld_rera_brokers",
        sa.Column("nationality_flag", sa.String(length=16), nullable=True),
    )
    # Index for filter-by-nationality queries on the directory page
    op.create_index(
        "ix_dld_rera_brokers_detected_nationality",
        "dld_rera_brokers",
        ["detected_nationality"],
    )


def downgrade() -> None:
    op.drop_index("ix_dld_rera_brokers_detected_nationality", "dld_rera_brokers")
    op.drop_column("dld_rera_brokers", "nationality_flag")
    op.drop_column("dld_rera_brokers", "detected_language")
    op.drop_column("dld_rera_brokers", "detected_nationality")
