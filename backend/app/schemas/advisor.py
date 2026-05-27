"""AI Advisor schemas (rules-based + LLM-augmented)."""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class AdvisorQueryRequest(BaseModel):
    budget_aed: float = Field(..., gt=0, description="Investment budget in AED")
    goal: Literal["yield", "appreciation", "balanced"] = "balanced"
    risk: Literal["low", "med", "high"] = "med"
    preferred_city: Optional[str] = Field(
        default=None, max_length=64,
        description="Optional city/emirate filter (free text, e.g. 'Dubai', 'Abu Dhabi')",
    )
    user_question: Optional[str] = Field(
        default=None, max_length=500,
        description="Optional free-text question for the AI analyst (≤500 chars)",
    )
    fresh: bool = Field(
        default=False,
        description="Bypass cache; admin-only, ignored for other roles",
    )


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

    # LLM-augmented fields (optional — populated when AI call succeeds)
    analysis: Optional[str] = Field(
        default=None, description="Full markdown analysis from the AI analyst"
    )
    confidence_score: Optional[float] = Field(
        default=None, description="0–1 self-rated confidence in the recommendation"
    )
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None
    cost_usd: Optional[float] = None
    latency_ms: Optional[int] = None
    cached: bool = False
    fallback_used: bool = False
    ai_error: Optional[str] = Field(
        default=None,
        description="Populated when the LLM call failed and rules-based fallback was used",
    )
