"""Phase 3 — off-plan TIER 1 (dld_projects, dld_developers) + TIER 2 shell.

dld_developers + dld_projects: official DLD registry (ingested from CSVs).
project_enrichment: empty TIER 2 table for indicative market data, kept
separate from official DLD.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-06-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dld_developers",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("developer_number", sa.String(32), nullable=False),
        sa.Column("developer_name", sa.String(255), nullable=False),
        sa.Column("registration_date", sa.DateTime(), nullable=True),
        sa.Column("license_source", sa.String(255), nullable=True),
        sa.Column("license_type", sa.String(100), nullable=True),
        sa.Column("legal_status", sa.String(100), nullable=True),
        sa.Column("webpage", sa.String(512), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("fax", sa.String(64), nullable=True),
        sa.Column("license_number", sa.String(64), nullable=True),
        sa.Column("license_issue_date", sa.DateTime(), nullable=True),
        sa.Column("license_expiry_date", sa.DateTime(), nullable=True),
        sa.Column("chamber_of_commerce_no", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_dld_developers_developer_number", "dld_developers", ["developer_number"], unique=True)
    op.create_index("ix_dld_developers_developer_name", "dld_developers", ["developer_name"])

    op.create_table(
        "dld_projects",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("project_number", sa.String(32), nullable=False),
        sa.Column("project_name", sa.String(512), nullable=True),
        sa.Column("developer_number", sa.String(32), nullable=True),
        sa.Column("developer_name", sa.String(255), nullable=True),
        sa.Column("project_type", sa.String(100), nullable=True),
        sa.Column("project_status", sa.String(64), nullable=True),
        sa.Column("percent_completed", sa.Numeric(6, 2), nullable=True),
        sa.Column("project_value", sa.Numeric(18, 2), nullable=True),
        sa.Column("escrow_account_number", sa.String(64), nullable=True),
        sa.Column("start_date", sa.DateTime(), nullable=True),
        sa.Column("end_date", sa.DateTime(), nullable=True),
        sa.Column("adoption_date", sa.DateTime(), nullable=True),
        sa.Column("inspection_date", sa.DateTime(), nullable=True),
        sa.Column("completion_date", sa.DateTime(), nullable=True),
        sa.Column("area_en", sa.String(255), nullable=True),
        sa.Column("area_name_norm", sa.String(255), nullable=True),
        sa.Column("zone_en", sa.String(255), nullable=True),
        sa.Column("master_project", sa.String(255), nullable=True),
        sa.Column("cnt_land", sa.Integer(), nullable=True),
        sa.Column("cnt_building", sa.Integer(), nullable=True),
        sa.Column("cnt_villa", sa.Integer(), nullable=True),
        sa.Column("cnt_unit", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_dld_projects_project_number", "dld_projects", ["project_number"], unique=True)
    op.create_index("ix_dld_projects_project_name", "dld_projects", ["project_name"])
    op.create_index("ix_dld_projects_developer_number", "dld_projects", ["developer_number"])
    op.create_index("ix_dld_projects_project_status", "dld_projects", ["project_status"])
    op.create_index("ix_dld_projects_area_name_norm", "dld_projects", ["area_name_norm"])

    op.create_table(
        "project_enrichment",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("project_number", sa.String(32), nullable=False),
        sa.Column("payment_plan", sa.String(64), nullable=True),
        sa.Column("starting_price_aed", sa.Numeric(18, 2), nullable=True),
        sa.Column("price_per_sqft_min", sa.Numeric(12, 2), nullable=True),
        sa.Column("price_per_sqft_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("bedroom_types", sa.String(255), nullable=True),
        sa.Column("enrichment_source", sa.String(255), nullable=True),
        sa.Column("enrichment_date", sa.Date(), nullable=True),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["project_number"], ["dld_projects.project_number"], ondelete="CASCADE"),
    )
    op.create_index("ix_project_enrichment_project_number", "project_enrichment", ["project_number"], unique=True)


def downgrade() -> None:
    op.drop_table("project_enrichment")
    op.drop_table("dld_projects")
    op.drop_table("dld_developers")
