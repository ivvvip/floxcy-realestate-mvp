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

    # ---- DLD-grounded signals (the 4 facts the advisor should reason from) ----
    # All optional — present only when the underlying DLD table has the area.
    # gross_yield_pct: rent_per_sqft / sale_ppsf × 100, capped at 20% display.
    #   Source: dld_area_metrics.rental_yield_pct (period=2026-ytd)
    gross_yield_pct: Optional[float] = Field(
        default=None,
        description="DLD-derived gross rental yield (%) for the latest period",
    )
    # rent_growth_yoy_pct: median rent ppsf change from 2025 to 2026 YTD.
    #   Source: dld_area_metrics.rent_growth_yoy_pct
    rent_growth_yoy_pct: Optional[float] = Field(
        default=None,
        description="YoY change in median rent per sqft from DLD Ejari contracts",
    )
    # appreciation_5y_pct + cagr_5y_pct: from 2021 → latest year sale ppsf.
    #   Source: dld_area_appreciation
    appreciation_5y_pct: Optional[float] = Field(
        default=None,
        description="Cumulative 5y price appreciation (%) from DLD sales 2021→2026",
    )
    cagr_5y_pct: Optional[float] = Field(
        default=None,
        description="Annualized 5y CAGR (%) for sale ppsf",
    )
    # supply_risk: classification derived from off-plan share of latest-year
    # sales. High off-plan share = lots of inventory coming online soon =
    # downward rent pressure once handed over.
    #   Source: dld_price_history.offplan_pct (latest year)
    supply_risk: Optional[Literal["low", "medium", "high"]] = Field(
        default=None,
        description="Supply pressure: low (<30% off-plan), medium (30-60%), "
                    "high (≥60%) of latest-year sales",
    )
    supply_risk_offplan_pct: Optional[float] = Field(
        default=None,
        description="Underlying off-plan share (%) that drove supply_risk",
    )
    dld_year_latest: Optional[int] = Field(
        default=None,
        description="Latest year of DLD price history used for the signals",
    )


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
