"""rent_alerts table for the /rent-check Get-alerts feature.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-01 19:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rent_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("area_name_norm", sa.String(255), nullable=False),
        sa.Column("area_name_display", sa.String(255), nullable=True),
        sa.Column("size_category", sa.String(16), nullable=True),
        sa.Column("prop_sub_type", sa.String(64), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "email", "area_name_norm", "size_category", "prop_sub_type",
            name="uq_rent_alert_email_area_size_type",
        ),
    )
    op.create_index("ix_rent_alerts_email", "rent_alerts", ["email"])
    op.create_index("ix_rent_alerts_area_name_norm", "rent_alerts", ["area_name_norm"])


def downgrade() -> None:
    op.drop_index("ix_rent_alerts_area_name_norm", table_name="rent_alerts")
    op.drop_index("ix_rent_alerts_email", table_name="rent_alerts")
    op.drop_table("rent_alerts")
