"""user_feedback — page-level feedback widget intake.

Revision ID: f9a0b1c2d3e4
Revises: f3a4b5c6d7e8
Create Date: 2026-06-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_feedback",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("page_url", sa.String(512), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("looking_for", sa.Text(), nullable=True),
        sa.Column("missing", sa.Text(), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_feedback_page_url", "user_feedback", ["page_url"])
    op.create_index("ix_user_feedback_rating", "user_feedback", ["rating"])
    op.create_index("ix_user_feedback_created_at", "user_feedback", ["created_at"])


def downgrade() -> None:
    op.drop_table("user_feedback")
