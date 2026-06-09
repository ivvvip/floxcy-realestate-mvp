"""Pydantic schemas for the monetization foundation (claims + admin accounts)."""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.account_types import ClaimType


# ---------------------------------------------------------------------------
# Public claim flow (PART 7)
# ---------------------------------------------------------------------------

class ClaimCreate(BaseModel):
    claim_type: ClaimType
    target_id: str = Field(..., min_length=1, max_length=64, description="broker_number / developer_number / agency real_estate_number")
    target_name: Optional[str] = Field(default=None, max_length=255)
    claimant_name: str = Field(..., min_length=2, max_length=255)
    claimant_email: Optional[EmailStr] = None
    claimant_phone: Optional[str] = Field(default=None, max_length=64)
    claimant_company: Optional[str] = Field(default=None, max_length=255)
    message: Optional[str] = Field(default=None, max_length=2000)


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    claim_type: str
    target_id: str
    target_name: Optional[str]
    claimant_name: str
    claimant_email: Optional[str]
    claimant_phone: Optional[str]
    claimant_company: Optional[str]
    message: Optional[str]
    status: str
    reviewed_at: Optional[datetime]
    review_note: Optional[str]
    created_at: datetime


class ClaimCreateResponse(BaseModel):
    claim_id: UUID
    status: str = "pending"
    message: str = "Claim received. Our team will verify and get back to you within 2 business days."


class ClaimReviewRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# Profiles (admin views)
# ---------------------------------------------------------------------------

class BrokerProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    broker_number: str
    user_id: Optional[UUID]
    photo_url: Optional[str]
    bio: Optional[str]
    years_experience: Optional[int]
    specialties: Optional[List[str]]
    languages: Optional[List[str]]
    areas_covered: Optional[List[str]]
    phone: Optional[str]
    whatsapp: Optional[str]
    email: Optional[str]
    is_verified: bool
    is_featured: bool
    subscription_tier: str
    claimed_at: Optional[datetime]
    created_at: datetime


class AgencyProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    real_estate_number: Optional[str]
    agency_name: str
    user_id: Optional[UUID]
    logo_url: Optional[str]
    description: Optional[str]
    license_number: Optional[str]
    broker_numbers: Optional[List[str]]
    is_verified: bool
    is_featured: bool
    subscription_tier: str
    claimed_at: Optional[datetime]
    created_at: datetime


class DeveloperAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    developer_number: str
    developer_name: Optional[str]
    user_id: Optional[UUID]
    logo_url: Optional[str]
    description: Optional[str]
    claimed_projects: Optional[List[str]]
    is_verified: bool
    subscription_tier: str
    lead_access: bool
    claimed_at: Optional[datetime]
    created_at: datetime


# ---------------------------------------------------------------------------
# Admin mutations
# ---------------------------------------------------------------------------

class ProfilePatch(BaseModel):
    """Admin manual controls (until Stripe is activated)."""
    is_verified: Optional[bool] = None
    is_featured: Optional[bool] = None
    subscription_tier: Optional[str] = Field(default=None, max_length=32)
    lead_access: Optional[bool] = None  # developer only


class UserSubscriptionPatch(BaseModel):
    account_type: Optional[str] = Field(default=None, max_length=32)
    subscription_status: Optional[str] = Field(default=None, max_length=16)
    is_paid: Optional[bool] = None
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Aggregate views
# ---------------------------------------------------------------------------

class AccountsOverview(BaseModel):
    brokers: List[BrokerProfileOut]
    agencies: List[AgencyProfileOut]
    developers: List[DeveloperAccountOut]
    counts: dict


class SubscriptionRow(BaseModel):
    kind: str          # user | broker | agency | developer
    id: UUID
    name: str
    account_or_tier: str
    status: str        # active | inactive | trial | (verified/unverified for profiles)
    is_paid: bool
    subscription_end: Optional[datetime] = None


class SubscriptionsOverview(BaseModel):
    rows: List[SubscriptionRow]
    counts: dict
