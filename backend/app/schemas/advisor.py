"""AI Advisor schemas (rules-based)."""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class AdvisorQueryRequest(BaseModel):
    budget_aed: float = Field(..., gt=0, description="Investment budget in AED")
    goal: Literal["yield", "appreciation", "balanced"] = "balanced"
    risk: Literal["low", "med", "high"] = "med"


class AdvisorRecommendation(BaseModel):
    rank: int
    area_id: str
    area_name: str
    area_name_arabic: Optional[str] = None
    score: float
    avg_price_per_sqft: float
    rental_yield: float
    appreciation_1y: Optional[float] = None
    risk_score: Optional[float] = None
    investment_score: Optional[float] = None
    estimated_affordable_sqft: float
    reasoning: List[str]


class AdvisorQueryResponse(BaseModel):
    goal: str
    risk: str
    budget_aed: float
    recommendations: List[AdvisorRecommendation]
