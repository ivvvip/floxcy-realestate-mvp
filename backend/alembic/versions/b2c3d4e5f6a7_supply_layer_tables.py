"""Supply layer: brokers, investment_opportunities, broker_applications, investor_leads, consultations.

Adds the broker / deal-flow tables that turn Floxcy from intelligence-only
into intelligence + curated deal flow. Purely additive; no edits to
existing tables.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-28 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- brokers ----
    op.create_table(
        "brokers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("whatsapp", sa.String(64), nullable=True),
        sa.Column("rera_license", sa.String(128), nullable=True),
        sa.Column("languages", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("specialist_areas", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("property_types", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("experience_years", sa.Integer(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("performance_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("response_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_brokers_email", "brokers", ["email"], unique=True)
    op.create_index("ix_brokers_status", "brokers", ["status"])

    # ---- investment_opportunities ----
    op.create_table(
        "investment_opportunities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "broker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("brokers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("emirate", sa.String(64), nullable=False, server_default="Dubai"),
        sa.Column("area", sa.String(255), nullable=False),
        sa.Column("property_type", sa.String(64), nullable=False),
        sa.Column("unit_type", sa.String(64), nullable=True),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("price_per_sqft", sa.Numeric(10, 2), nullable=True),
        sa.Column("expected_annual_rent", sa.Numeric(12, 2), nullable=True),
        sa.Column("expected_gross_yield", sa.Float(), nullable=True),
        sa.Column("expected_net_yield", sa.Float(), nullable=True),
        sa.Column("service_charges", sa.Numeric(10, 2), nullable=True),
        sa.Column("strategy_type", sa.String(32), nullable=False, server_default="balanced"),
        sa.Column("opportunity_score", sa.Float(), nullable=True),
        sa.Column("risk_level", sa.String(32), nullable=False, server_default="medium"),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("why_opportunity", sa.Text(), nullable=True),
        sa.Column("risk_summary", sa.Text(), nullable=True),
        sa.Column("best_for", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="broker"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_investment_opportunities_broker_id",
        "investment_opportunities",
        ["broker_id"],
    )
    op.create_index(
        "ix_investment_opportunities_area",
        "investment_opportunities",
        ["area"],
    )
    op.create_index(
        "ix_investment_opportunities_status_source_type",
        "investment_opportunities",
        ["status", "source_type"],
    )

    # ---- broker_applications ----
    op.create_table(
        "broker_applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("whatsapp", sa.String(64), nullable=True),
        sa.Column("rera_license", sa.String(128), nullable=True),
        sa.Column("specialist_areas", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("experience_years", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_broker_applications_email", "broker_applications", ["email"])
    op.create_index("ix_broker_applications_status", "broker_applications", ["status"])

    # ---- investor_leads ----
    op.create_table(
        "investor_leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "opportunity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("investment_opportunities.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "matched_broker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("brokers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("whatsapp", sa.String(64), nullable=True),
        sa.Column("budget", sa.Numeric(14, 2), nullable=True),
        sa.Column("investment_goal", sa.String(64), nullable=True),
        sa.Column("risk_level", sa.String(32), nullable=True),
        sa.Column("preferred_area", sa.String(255), nullable=True),
        sa.Column("timeline", sa.String(64), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("lead_score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_investor_leads_status", "investor_leads", ["status"])
    op.create_index(
        "ix_investor_leads_opportunity_id", "investor_leads", ["opportunity_id"]
    )
    op.create_index(
        "ix_investor_leads_matched_broker_id",
        "investor_leads",
        ["matched_broker_id"],
    )

    # ---- consultations ----
    op.create_table(
        "consultations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "investor_lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("investor_leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "broker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("brokers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "opportunity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("investment_opportunities.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(32), nullable=False, server_default="requested"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_consultations_broker_id", "consultations", ["broker_id"])
    op.create_index("ix_consultations_status", "consultations", ["status"])


def downgrade() -> None:
    op.drop_index("ix_consultations_status", table_name="consultations")
    op.drop_index("ix_consultations_broker_id", table_name="consultations")
    op.drop_table("consultations")

    op.drop_index(
        "ix_investor_leads_matched_broker_id", table_name="investor_leads"
    )
    op.drop_index("ix_investor_leads_opportunity_id", table_name="investor_leads")
    op.drop_index("ix_investor_leads_status", table_name="investor_leads")
    op.drop_table("investor_leads")

    op.drop_index("ix_broker_applications_status", table_name="broker_applications")
    op.drop_index("ix_broker_applications_email", table_name="broker_applications")
    op.drop_table("broker_applications")

    op.drop_index(
        "ix_investment_opportunities_status_source_type",
        table_name="investment_opportunities",
    )
    op.drop_index(
        "ix_investment_opportunities_area", table_name="investment_opportunities"
    )
    op.drop_index(
        "ix_investment_opportunities_broker_id",
        table_name="investment_opportunities",
    )
    op.drop_table("investment_opportunities")

    op.drop_index("ix_brokers_status", table_name="brokers")
    op.drop_index("ix_brokers_email", table_name="brokers")
    op.drop_table("brokers")
