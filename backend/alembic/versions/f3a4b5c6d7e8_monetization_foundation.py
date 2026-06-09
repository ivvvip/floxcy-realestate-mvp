"""Monetization foundation — account types, claimable profiles, lead routing.

FOUNDATION ONLY (no payment, no feature gating):
 - users: account_type + subscription_status/start/end + is_paid
 - broker_profiles / agency_profiles / developer_accounts: claimable profiles
 - account_claims: intake for the public 'Claim this profile' flow
 - investor_leads: lead_type, lead_status + assigned_broker/developer/agency FKs

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-06-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STR_ARRAY = postgresql.ARRAY(sa.String())


def upgrade() -> None:
    # --- PART 1: account types on users ---
    op.add_column("users", sa.Column("account_type", sa.String(32), nullable=False, server_default="free"))
    op.add_column("users", sa.Column("subscription_status", sa.String(16), nullable=False, server_default="inactive"))
    op.add_column("users", sa.Column("subscription_start", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("subscription_end", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_users_account_type", "users", ["account_type"])

    # --- PART 2: broker_profiles ---
    op.create_table(
        "broker_profiles",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("broker_number", sa.String(32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("photo_url", sa.String(512), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("years_experience", sa.Integer(), nullable=True),
        sa.Column("specialties", _STR_ARRAY, nullable=True),
        sa.Column("languages", _STR_ARRAY, nullable=True),
        sa.Column("areas_covered", _STR_ARRAY, nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("whatsapp", sa.String(64), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("subscription_tier", sa.String(32), nullable=False, server_default="broker_basic"),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["broker_number"], ["dld_rera_brokers.broker_number"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("broker_number", name="uq_broker_profiles_broker_number"),
    )
    op.create_index("ix_broker_profiles_broker_number", "broker_profiles", ["broker_number"])
    op.create_index("ix_broker_profiles_user_id", "broker_profiles", ["user_id"])
    op.create_index("ix_broker_profiles_is_verified", "broker_profiles", ["is_verified"])
    op.create_index("ix_broker_profiles_is_featured", "broker_profiles", ["is_featured"])

    # --- PART 3: agency_profiles (created before investor_leads FK) ---
    op.create_table(
        "agency_profiles",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("real_estate_number", sa.String(32), nullable=True),
        sa.Column("agency_name", sa.String(255), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("license_number", sa.String(64), nullable=True),
        sa.Column("broker_numbers", _STR_ARRAY, nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("subscription_tier", sa.String(32), nullable=False, server_default="agency"),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("real_estate_number", name="uq_agency_profiles_real_estate_number"),
    )
    op.create_index("ix_agency_profiles_real_estate_number", "agency_profiles", ["real_estate_number"])
    op.create_index("ix_agency_profiles_agency_name", "agency_profiles", ["agency_name"])
    op.create_index("ix_agency_profiles_user_id", "agency_profiles", ["user_id"])
    op.create_index("ix_agency_profiles_is_verified", "agency_profiles", ["is_verified"])
    op.create_index("ix_agency_profiles_is_featured", "agency_profiles", ["is_featured"])

    # --- PART 4: developer_accounts ---
    op.create_table(
        "developer_accounts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("developer_number", sa.String(32), nullable=False),
        sa.Column("developer_name", sa.String(255), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("claimed_projects", _STR_ARRAY, nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("subscription_tier", sa.String(32), nullable=False, server_default="developer_basic"),
        sa.Column("lead_access", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["developer_number"], ["dld_developers.developer_number"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("developer_number", name="uq_developer_accounts_developer_number"),
    )
    op.create_index("ix_developer_accounts_developer_number", "developer_accounts", ["developer_number"])
    op.create_index("ix_developer_accounts_user_id", "developer_accounts", ["user_id"])
    op.create_index("ix_developer_accounts_is_verified", "developer_accounts", ["is_verified"])

    # --- PART 7: account_claims (intake for the claim flow) ---
    op.create_table(
        "account_claims",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("claim_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("target_name", sa.String(255), nullable=True),
        sa.Column("claimant_name", sa.String(255), nullable=False),
        sa.Column("claimant_email", sa.String(255), nullable=True),
        sa.Column("claimant_phone", sa.String(64), nullable=True),
        sa.Column("claimant_company", sa.String(255), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("reviewed_by", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_account_claims_claim_type", "account_claims", ["claim_type"])
    op.create_index("ix_account_claims_target_id", "account_claims", ["target_id"])
    op.create_index("ix_account_claims_status", "account_claims", ["status"])
    op.create_index("ix_account_claims_created_at", "account_claims", ["created_at"])

    # --- PART 5: lead routing on investor_leads ---
    op.add_column("investor_leads", sa.Column("lead_type", sa.String(16), nullable=True))
    op.add_column("investor_leads", sa.Column("lead_status", sa.String(16), nullable=False, server_default="new"))
    op.add_column("investor_leads", sa.Column("assigned_broker_number", sa.String(32), nullable=True))
    op.add_column("investor_leads", sa.Column("assigned_developer_number", sa.String(32), nullable=True))
    op.add_column("investor_leads", sa.Column("assigned_agency_id", sa.UUID(), nullable=True))
    op.create_index("ix_investor_leads_lead_type", "investor_leads", ["lead_type"])
    op.create_index("ix_investor_leads_lead_status", "investor_leads", ["lead_status"])
    op.create_index("ix_investor_leads_assigned_broker_number", "investor_leads", ["assigned_broker_number"])
    op.create_index("ix_investor_leads_assigned_developer_number", "investor_leads", ["assigned_developer_number"])
    op.create_index("ix_investor_leads_assigned_agency_id", "investor_leads", ["assigned_agency_id"])
    op.create_foreign_key(
        "fk_investor_leads_assigned_broker_number", "investor_leads", "dld_rera_brokers",
        ["assigned_broker_number"], ["broker_number"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_investor_leads_assigned_developer_number", "investor_leads", "dld_developers",
        ["assigned_developer_number"], ["developer_number"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_investor_leads_assigned_agency_id", "investor_leads", "agency_profiles",
        ["assigned_agency_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_investor_leads_assigned_agency_id", "investor_leads", type_="foreignkey")
    op.drop_constraint("fk_investor_leads_assigned_developer_number", "investor_leads", type_="foreignkey")
    op.drop_constraint("fk_investor_leads_assigned_broker_number", "investor_leads", type_="foreignkey")
    for ix in ("ix_investor_leads_assigned_agency_id", "ix_investor_leads_assigned_developer_number",
               "ix_investor_leads_assigned_broker_number", "ix_investor_leads_lead_status",
               "ix_investor_leads_lead_type"):
        op.drop_index(ix, table_name="investor_leads")
    for col in ("assigned_agency_id", "assigned_developer_number", "assigned_broker_number",
                "lead_status", "lead_type"):
        op.drop_column("investor_leads", col)

    op.drop_table("account_claims")
    op.drop_table("developer_accounts")
    op.drop_table("agency_profiles")
    op.drop_table("broker_profiles")

    op.drop_index("ix_users_account_type", table_name="users")
    for col in ("is_paid", "subscription_end", "subscription_start", "subscription_status", "account_type"):
        op.drop_column("users", col)
