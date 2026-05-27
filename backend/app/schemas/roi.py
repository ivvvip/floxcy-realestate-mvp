"""ROI calculation schemas."""
from typing import Optional
from pydantic import BaseModel, Field


class ROICalculateRequest(BaseModel):
    """Request schema for ROI calculation."""
    property_price: float = Field(..., gt=0, description="Property price in AED")
    annual_rent: float = Field(..., gt=0, description="Annual rent in AED")
    service_charges: float = Field(0, ge=0, description="Annual service charges in AED")
    maintenance_cost: float = Field(0, ge=0, description="Annual maintenance cost in AED")
    other_costs: float = Field(0, ge=0, description="Other annual costs in AED")


class ROICalculateResponse(BaseModel):
    """Response schema for ROI calculation."""
    property_price: float
    annual_rent: float
    total_costs: float
    annual_net_income: float
    gross_yield: float = Field(..., description="Gross yield percentage")
    net_yield: float = Field(..., description="Net yield percentage")
    payback_years: Optional[float] = Field(None, description="Years to recover investment")
    interpretation: str = Field(..., description="Investment interpretation")
