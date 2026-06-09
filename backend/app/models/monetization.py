"""Monetization foundation — claimable profiles + claim intake.

FOUNDATION ONLY. These tables hold the data model and admin-managed state for
the future paid product (claim → verify → upgrade tier). No payment processing
and no feature gating are wired yet; `is_featured` / `subscription_tier` are set
manually by an admin until Stripe is activated. See docs/MONETIZATION-PLAN.md.

Identity links:
  - BrokerProfile.broker_number   → dld_rera_brokers.broker_number (PK)
  - DeveloperAccount.developer_number → dld_developers.developer_number (unique)
  - AgencyProfile.real_estate_number  → RERA agency id (string; no agencies table)
  - *.user_id                     → users.id (nullable; set when an account owns it)
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    ARRAY, Boolean, DateTime, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BrokerProfile(Base):
    """A claimed/enriched profile for a RERA-listed broker. One per broker_number."""
    __tablename__ = "broker_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    broker_number: Mapped[str] = mapped_column(
        String(32), ForeignKey("dld_rera_brokers.broker_number", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    photo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    years_experience: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    specialties: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    languages: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    areas_covered: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    subscription_tier: Mapped[str] = mapped_column(String(32), default="broker_basic", nullable=False)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AgencyProfile(Base):
    """A claimed/enriched agency profile, keyed on the RERA real-estate number."""
    __tablename__ = "agency_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    real_estate_number: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True, index=True)
    agency_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    license_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Linked broker_numbers under this agency (RERA brokers).
    broker_numbers: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    subscription_tier: Mapped[str] = mapped_column(String(32), default="agency", nullable=False)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeveloperAccount(Base):
    """A claimed developer account, keyed on the DLD developer_number. Owners can
    later populate project_enrichment for their claimed_projects."""
    __tablename__ = "developer_accounts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    developer_number: Mapped[str] = mapped_column(
        String(32), ForeignKey("dld_developers.developer_number", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    developer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # project_numbers this developer is allowed to enrich (TIER 2).
    claimed_projects: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    subscription_tier: Mapped[str] = mapped_column(String(32), default="developer_basic", nullable=False)
    # When activated, a paid developer can see leads routed to their projects.
    lead_access: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AccountClaim(Base):
    """Intake for the public 'Claim this profile' flow (PART 7). A claim is a
    pending request; an admin approves it, which creates/links the matching
    profile and marks it verified. No payment is involved at claim time."""
    __tablename__ = "account_claims"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    claim_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # broker|agency|developer
    # target identifier: broker_number / developer_number / agency real_estate_number (or name fallback)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    claimant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    claimant_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    claimant_phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    claimant_company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False, index=True)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    reviewed_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
