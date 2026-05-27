"""Compare schemas."""
from typing import List, Optional
from datetime import date
from pydantic import BaseModel


class CompareSnapshotPoint(BaseModel):
    snapshot_date: date
    avg_price_per_sqft: float
    rental_yield: float
    avg_sale_price: float


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


class CompareResponse(BaseModel):
    areas: List[CompareAreaData]
