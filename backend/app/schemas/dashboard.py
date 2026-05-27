"""Dashboard schemas."""
from typing import List, Optional
from pydantic import BaseModel


class TopAreaItem(BaseModel):
    id: str
    name: str
    name_arabic: Optional[str] = None
    area_type: str
    avg_price_per_sqft: float
    rental_yield: float
    appreciation_1y: Optional[float] = None
    investment_score: Optional[float] = None


class TrendPoint(BaseModel):
    month: str  # YYYY-MM
    avg_price_per_sqft: float
    avg_yield: float


class DashboardSummary(BaseModel):
    total_areas: int
    avg_yield: float
    avg_price_per_sqft: float
    top_performer: Optional[TopAreaItem] = None
    total_transaction_volume: int
    top_areas: List[TopAreaItem]
    price_trend: List[TrendPoint]
