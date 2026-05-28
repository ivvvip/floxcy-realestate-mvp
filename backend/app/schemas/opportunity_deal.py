"""Pydantic schemas for broker-submitted investment opportunities (deals).

Distinct from the area-derived signals computed by ``opportunity_engine``;
both are surfaced under the unified ``/api/v1/opportunities`` feed via a
``kind`` discriminator on the API response.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


STRATEGY_TYPES = ("income", "growth", "balanced", "luxury", "high-risk")
RISK_LEVELS = ("low", "medium", "high")
SOURCE_TYPES = ("broker", "developer", "manual")
DEAL_STATUSES = ("draft", "pending_review", "approved", "rejected", "archived")


class DealCreate(BaseModel):
    """Broker submission payload.

    Quality control rule (Phase 7): every published opportunity must include
    yield, confidence, strategy, risk, why, and risks. These are required at
    submission time so brokers can't bypass curation by submitting a stub.
    """

    title: str = Field(..., min_length=4, max_length=255)
    emirate: str = Field("Dubai", max_length=64)
    area: str = Field(..., min_length=1, max_length=255)
    property_type: str = Field(..., max_length=64)
    unit_type: Optional[str] = Field(None, max_length=64)
    price: Decimal = Field(..., gt=0)
    price_per_sqft: Optional[Decimal] = Field(None, gt=0)
    expected_annual_rent: Optional[Decimal] = Field(None, ge=0)
    expected_gross_yield: float = Field(
        ..., ge=0, le=50, description="Required: expected gross rental yield (%)."
    )
    expected_net_yield: Optional[float] = Field(None, ge=0, le=50)
    service_charges: Optional[Decimal] = Field(None, ge=0)
    strategy_type: str = Field(..., pattern="^(income|growth|balanced|luxury|high-risk)$")
    risk_level: str = Field(..., pattern="^(low|medium|high)$")
    confidence_score: float = Field(
        ...,
        ge=0,
        le=100,
        description="Required: broker confidence 0-100 (use 50 if unsure).",
    )
    why_opportunity: str = Field(..., min_length=10, description="Investment thesis — required")
    risk_summary: str = Field(..., min_length=10, description="Risks — required")
    best_for: Optional[str] = None


class DealUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=4, max_length=255)
    price: Optional[Decimal] = Field(None, gt=0)
    price_per_sqft: Optional[Decimal] = Field(None, gt=0)
    expected_annual_rent: Optional[Decimal] = Field(None, ge=0)
    expected_gross_yield: Optional[float] = Field(None, ge=0, le=50)
    expected_net_yield: Optional[float] = Field(None, ge=0, le=50)
    service_charges: Optional[Decimal] = Field(None, ge=0)
    strategy_type: Optional[str] = Field(None, pattern="^(income|growth|balanced|luxury|high-risk)$")
    risk_level: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    confidence_score: Optional[float] = Field(None, ge=0, le=100)
    why_opportunity: Optional[str] = None
    risk_summary: Optional[str] = None
    best_for: Optional[str] = None
    # Broker can move draft -> pending_review; admin owns approved/rejected (Phase 7).
    status: Optional[str] = Field(None, pattern="^(draft|pending_review|archived)$")


class DealAdminUpdate(BaseModel):
    """Admin can override anything, including approval status."""

    opportunity_score: Optional[float] = Field(None, ge=0, le=100)
    status: Optional[str] = Field(None, pattern="^(draft|pending_review|approved|rejected|archived)$")
    source_type: Optional[str] = Field(None, pattern="^(broker|developer|manual)$")


class BrokerStub(BaseModel):
    """Tiny broker projection embedded in deal responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    company_name: Optional[str]
    whatsapp: Optional[str]
    phone: Optional[str]


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    broker_id: Optional[UUID]
    title: str
    emirate: str
    area: str
    property_type: str
    unit_type: Optional[str]
    price: Decimal
    price_per_sqft: Optional[Decimal]
    expected_annual_rent: Optional[Decimal]
    expected_gross_yield: Optional[float]
    expected_net_yield: Optional[float]
    service_charges: Optional[Decimal]
    strategy_type: str
    opportunity_score: Optional[float]
    risk_level: str
    confidence_score: Optional[float]
    why_opportunity: Optional[str]
    risk_summary: Optional[str]
    best_for: Optional[str]
    status: str
    source_type: str
    created_at: datetime
    updated_at: datetime
    broker: Optional[BrokerStub] = None
