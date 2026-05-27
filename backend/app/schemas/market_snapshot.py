"""MarketSnapshot Pydantic schemas."""
from datetime import datetime, date
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class MarketSnapshotBase(BaseModel):
    """Base schema for MarketSnapshot."""
    snapshot_date: date
    avg_sale_price: float = Field(..., gt=0, description="Average sale price in AED")
    avg_price_per_sqft: float = Field(..., gt=0, description="Price per square foot in AED")
    avg_annual_rent: float = Field(..., gt=0, description="Average annual rent in AED")
    rental_yield: float = Field(..., ge=0, le=100, description="Rental yield percentage")
    occupancy_rate: Optional[float] = Field(None, ge=0, le=100)
    appreciation_1y: Optional[float] = Field(None, description="1-year appreciation %")
    appreciation_3y: Optional[float] = Field(None, description="3-year appreciation %")
    transaction_volume: Optional[int] = Field(None, ge=0)
    demand_score: Optional[float] = Field(None, ge=0, le=10)
    risk_score: Optional[float] = Field(None, ge=0, le=10)
    investment_score: Optional[float] = Field(None, ge=0, le=10)
    data_source: str = Field("manual", max_length=255)


class MarketSnapshotCreate(MarketSnapshotBase):
    """Schema for creating a snapshot."""
    area_id: UUID


class MarketSnapshotResponse(MarketSnapshotBase):
    """Schema for snapshot response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    area_id: UUID
    created_at: datetime
