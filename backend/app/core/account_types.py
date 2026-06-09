"""Monetization vocabulary — account types, subscription states, claim/lead enums.

Stored as plain strings in the DB (matching the existing `users.role` pattern)
rather than Postgres ENUM types, which are migration-hostile. These constants
are the single source of truth for validation and for the admin UI.

NOTE: This is the FOUNDATION only. No payment processing and no feature gating
are wired yet — `is_paid` / `subscription_tier` are set manually by an admin
until Stripe is activated (see docs/MONETIZATION-PLAN.md).
"""
from enum import Enum


class AccountType(str, Enum):
    FREE = "free"
    INVESTOR_PREMIUM = "investor_premium"
    BROKER_BASIC = "broker_basic"
    BROKER_PREMIUM = "broker_premium"
    AGENCY = "agency"
    DEVELOPER_BASIC = "developer_basic"
    DEVELOPER_PRO = "developer_pro"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    TRIAL = "trial"


class ClaimType(str, Enum):
    BROKER = "broker"
    AGENCY = "agency"
    DEVELOPER = "developer"


class ClaimStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class LeadType(str, Enum):
    BROKER = "broker"
    DEVELOPER = "developer"
    AGENCY = "agency"


class LeadStatus(str, Enum):
    NEW = "new"
    SENT = "sent"
    CONTACTED = "contacted"
    CLOSED = "closed"


# Which account_type a claim grants once approved (admin can override).
CLAIM_TYPE_TO_ACCOUNT: dict[str, str] = {
    ClaimType.BROKER.value: AccountType.BROKER_BASIC.value,
    ClaimType.AGENCY.value: AccountType.AGENCY.value,
    ClaimType.DEVELOPER.value: AccountType.DEVELOPER_BASIC.value,
}

ACCOUNT_TYPES = [t.value for t in AccountType]
SUBSCRIPTION_STATUSES = [s.value for s in SubscriptionStatus]
CLAIM_TYPES = [t.value for t in ClaimType]
CLAIM_STATUSES = [s.value for s in ClaimStatus]
LEAD_TYPES = [t.value for t in LeadType]
LEAD_STATUSES = [s.value for s in LeadStatus]
