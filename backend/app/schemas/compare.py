"""Compare schemas."""
from typing import List, Optional
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class CompareSnapshotPoint(BaseModel):
    snapshot_date: date
    avg_price_per_sqft: float
    rental_yield: float
    avg_sale_price: float


class CompareDldBlock(BaseModel):
    dld_area_id: UUID
    dld_name: str
    median_price_per_sqft: Optional[float] = None
    median_annual_rent: Optional[float] = None
    median_rent_per_sqft: Optional[float] = None
    rental_yield_pct: Optional[float] = None
    rent_growth_yoy_pct: Optional[float] = None
    sales_count: int = 0
    rent_count_2026: int = 0
    confidence: str = "low"


class CompareAreaData(BaseModel):
    id: str
    name: str
    name_arabic: Optional[str] = None
    area_type: str
    latest_price_per_sqft: float
    latest_yield: float
    latest_sale_price: float
    appreciation_1y: Optional[float] = None
    appreciation_3y: Optional[float] = None
    occupancy_rate: Optional[float] = None
    demand_score: Optional[float] = None
    risk_score: Optional[float] = None
    investment_score: Optional[float] = None
    history: List[CompareSnapshotPoint]
    dld: Optional[CompareDldBlock] = None


class CompareResponse(BaseModel):
    areas: List[CompareAreaData]
    data_source: str = "Dubai Land Department Open Data"
    last_updated: str = "2026-06-01"
