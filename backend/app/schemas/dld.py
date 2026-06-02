"""Pydantic schemas for DLD-sourced endpoints."""
from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


DATA_SOURCE = "Dubai Land Department Open Data"
LAST_UPDATED = "2026-06-01"

# Per-area presentation rules (locked by spec)
MIN_RELIABLE_SAMPLES = 30
# Lowered from 25.0 to 20.0 on 2026-06-02. Raw yields above 20% in DLD data
# almost always reflect a unit-type mismatch (commercial rent vs residential
# sale) or a tiny sample; capping at 20 hides those artefacts. The frontend
# renders capped cells as "≥20%" with a footnote so users know it's bounded.
DISPLAY_YIELD_CAP_PCT = 20.0


def confidence_for(n: int) -> str:
    if n >= 100:
        return "high"
    if n >= MIN_RELIABLE_SAMPLES:
        return "medium"
    return "low"


def cap_yield(y: Optional[float]) -> Optional[float]:
    if y is None:
        return None
    if y > DISPLAY_YIELD_CAP_PCT:
        return DISPLAY_YIELD_CAP_PCT
    if y < 0:
        return 0.0
    return float(y)


class Attribution(BaseModel):
    """Inline attribution carried on every DLD response."""
    data_source: str = DATA_SOURCE
    last_updated: str = LAST_UPDATED


# ---------------------------------------------------------------------------
# Areas
# ---------------------------------------------------------------------------

class DldAreaListItem(BaseModel):
    id: UUID
    name: str
    name_norm: str
    median_price_per_sqft: Optional[float] = None
    median_annual_rent: Optional[float] = None
    median_rent_per_sqft: Optional[float] = None
    rental_yield_pct: Optional[float] = None
    rent_growth_yoy_pct: Optional[float] = None
    sales_count: int = 0
    rent_count_2026: int = 0
    confidence: str = "low"


class DldAreaListResponse(Attribution):
    count: int
    total_available: int
    items: List[DldAreaListItem]


class PriceHistoryPoint(BaseModel):
    year: int
    avg_ppsf: Optional[float] = None          # all-units blended
    avg_ppsf_ready: Optional[float] = None    # ready-stock only (preferred for charts)
    avg_ppsf_offplan: Optional[float] = None  # off-plan launches
    median_ppsf: Optional[float] = None
    transaction_count: int = 0
    offplan_pct: Optional[float] = None


class RentHistoryPoint(BaseModel):
    year: int
    avg_annual_rent: Optional[float] = None
    avg_rent_per_sqft: Optional[float] = None
    median_annual_rent: Optional[float] = None
    contract_count: int = 0
    renewal_rate_pct: Optional[float] = None


class YieldHistoryPoint(BaseModel):
    year: int
    gross_yield_pct: Optional[float] = None
    sale_ppsf: Optional[float] = None
    rent_psf: Optional[float] = None
    yield_delta_yoy_pct: Optional[float] = None
    sample_score: int = 0


class DldAreaDetail(DldAreaListItem):
    building_count: int = 0
    avg_price_per_sqft: Optional[float] = None
    avg_annual_rent: Optional[float] = None
    avg_rent_per_sqft: Optional[float] = None
    # Historical price signals from scripts/etl_dld_history.py
    price_appreciation_1y_pct: Optional[float] = None
    price_appreciation_3y_pct: Optional[float] = None
    price_appreciation_5y_pct: Optional[float] = None
    cagr_5y_pct: Optional[float] = None
    years_of_history: int = 0
    price_history: List[PriceHistoryPoint] = []
    rent_history: List[RentHistoryPoint] = []
    yield_history: List[YieldHistoryPoint] = []
    yield_trend: Optional[str] = None  # 'rising' | 'falling' | 'flat'


class DldAreaDetailResponse(Attribution):
    area: DldAreaDetail


class DldPriceHistoryResponse(Attribution):
    area_name_norm: str
    area_name_display: str
    points: List[PriceHistoryPoint]
    appreciation_1y_pct: Optional[float] = None
    appreciation_3y_pct: Optional[float] = None
    appreciation_5y_pct: Optional[float] = None
    cagr_5y_pct: Optional[float] = None
    years_of_history: int = 0


class TopAppreciationItem(BaseModel):
    area_name_norm: str
    area_name_display: str
    appreciation_5y_pct: float
    cagr_5y_pct: Optional[float] = None
    appreciation_1y_pct: Optional[float] = None
    latest_avg_ppsf: Optional[float] = None
    years_of_data: int


class TopAppreciationResponse(Attribution):
    count: int
    items: List[TopAppreciationItem]


# ---------------------------------------------------------------------------
# Market overview — homepage KPI tiles
# ---------------------------------------------------------------------------

class MarketOverviewResponse(Attribution):
    """Single-call snapshot for the homepage 'Market at a Glance' tiles.

    Cached in Redis for 1h. Source counts are live from the DLD tables we
    already ETL; the 'top' picks require both a real number and a real area
    so missing tables degrade gracefully to None rather than zero.
    """
    # Volume / breadth
    total_sales: int
    total_volume_aed: float
    areas_covered: int
    active_brokers: int
    buildings_tracked: int
    rent_contracts: int
    # Headline yield + appreciation
    avg_yield_pct: Optional[float] = None
    top_yield_area: Optional[str] = None
    top_yield_pct: Optional[float] = None
    top_appreciation_area: Optional[str] = None
    top_appreciation_pct: Optional[float] = None
    offplan_percentage: Optional[float] = None
    cached: bool = False


class DldRentHistoryResponse(Attribution):
    area_name_norm: str
    area_name_display: str
    points: List[RentHistoryPoint]
    years_of_history: int = 0


class DldYieldHistoryResponse(Attribution):
    area_name_norm: str
    area_name_display: str
    points: List[YieldHistoryPoint]
    years_of_history: int = 0
    # Direction of travel (latest vs first non-null in the series)
    trend: Optional[str] = None  # 'rising' | 'falling' | 'flat' | None


class DldStatsResponse(Attribution):
    total_areas: int
    areas_with_metrics: int
    areas_with_full_yield: int
    total_buildings: int
    total_active_brokers: int
    total_rent_benchmark_cells: int


# ---------------------------------------------------------------------------
# Buildings
# ---------------------------------------------------------------------------

class DldBuildingItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_name: Optional[str] = None
    master_project: Optional[str] = None
    area_name: Optional[str] = None
    prop_sub_type: Optional[str] = None
    flats: Optional[int] = None
    floors: Optional[int] = None
    avg_annual_rent: Optional[float] = None
    avg_rent_per_sqft: Optional[float] = None
    active_rent_count: int = 0
    occupancy_proxy_pct: Optional[float] = None
    is_freehold: Optional[bool] = None
    # Derived (computed at response-build time)
    total_annual_income: Optional[float] = None
    income_range_label: Optional[str] = None
    confidence: Optional[str] = None


class DldBuildingsResponse(Attribution):
    count: int
    total_available: int
    items: List[DldBuildingItem]


# -----------------------------------------------------------------------------
# Building detail (X-Ray)
# -----------------------------------------------------------------------------

class DldBuildingAreaContext(BaseModel):
    """The parent DLD area's headline figures, embedded for fast comparison."""
    dld_area_id: UUID
    name: str
    name_norm: str
    # If the admin sector aliases to a marketing-friendly community name
    # (e.g. "Wadi Al Safa 5" → "Arabian Ranches"), surface that here so the
    # building detail page can render a natural subtitle.
    community_name: Optional[str] = None
    median_price_per_sqft: Optional[float] = None
    median_annual_rent: Optional[float] = None
    median_rent_per_sqft: Optional[float] = None
    rental_yield_pct: Optional[float] = None
    rent_growth_yoy_pct: Optional[float] = None
    sales_count: int = 0
    rent_count_2026: int = 0


class DldBuildingDetail(DldBuildingItem):
    """Same shape as the list item plus area context + implied yield."""
    swimming_pools: Optional[int] = None
    car_parks: Optional[int] = None
    elevators: Optional[int] = None
    bld_levels: Optional[int] = None
    is_offplan: Optional[bool] = None
    implied_yield_pct: Optional[float] = None
    estimated_unit_size_sqft: Optional[float] = None
    estimated_unit_price: Optional[float] = None
    area_context: Optional[DldBuildingAreaContext] = None


class DldBuildingDetailResponse(BaseModel):
    """Attribution explicitly cites Ejari, the DLD's rent contract registry."""
    data_source: str = "Dubai Land Department · Ejari rent contract registry"
    last_updated: str = LAST_UPDATED
    building: DldBuildingDetail


class DldBuildingsComparableResponse(BaseModel):
    data_source: str = "Dubai Land Department · Ejari rent contract registry"
    last_updated: str = LAST_UPDATED
    base_building_id: UUID
    count: int
    items: List[DldBuildingItem]


class DldAreaTopBuildingsResponse(BaseModel):
    data_source: str = "Dubai Land Department · Ejari rent contract registry"
    last_updated: str = LAST_UPDATED
    area_name: str
    count: int
    items: List[DldBuildingItem]


# ---------------------------------------------------------------------------
# Rent check ("Is your rent fair?")
# ---------------------------------------------------------------------------

SizeCategory = Literal["studio", "1br", "2br", "3br", "4br"]

# Each category maps to a primary size_band, with optional fallbacks if the
# primary band has no benchmark for that (area, prop_sub_type).
SIZE_CATEGORY_BANDS: dict[str, list[str]] = {
    "studio": ["<50"],
    "1br": ["50-99"],
    "2br": ["100-149"],
    "3br": ["150-199"],
    "4br": ["200-299", "300+"],
}


class RentCheckRequest(BaseModel):
    area_name: str = Field(..., min_length=2, max_length=128)
    size_sqm: Optional[float] = Field(None, gt=0, lt=10000)
    size_category: Optional[SizeCategory] = Field(
        None,
        description="Preferred over size_sqm — maps directly to a DLD size band",
    )
    annual_rent: float = Field(..., gt=0, lt=50_000_000)
    prop_sub_type: str = Field("Flat", max_length=64)
    # NOTE: "one of size_sqm or size_category" is enforced in the endpoint
    # (raises HTTPException(422)). Tried a @model_validator(mode='after')
    # raising ValueError — Pydantic wraps it as ValidationError but FastAPI
    # 0.115 doesn't translate model-level validation errors to
    # RequestValidationError reliably, so they surface as 500. Keeping the
    # check at the endpoint level guarantees the right status code.


class RentCheckSuggestion(BaseModel):
    area_name: str
    median_annual_rent: float
    median_rent_per_sqft: float
    saving_pct: float
    sample_size: int


class RentCheckResponse(Attribution):
    user_rent: float
    area_median: float
    percentile: float
    verdict: str  # "above_market" | "fair" | "below_market"
    percentage_diff: float
    sample_size: int
    yoy_trend: Optional[float] = None
    size_band: str
    confidence: str
    # Enriched fields for the Rent-vs-Buy feature on the frontend
    area_name_display: Optional[str] = None
    area_name_norm: Optional[str] = None
    median_price_per_sqft: Optional[float] = None
    avg_price_per_sqft: Optional[float] = None
    suggested_areas: List[RentCheckSuggestion] = []


# ---------------------------------------------------------------------------
# Rent alerts
# ---------------------------------------------------------------------------

class RentAlertCreate(BaseModel):
    email: str = Field(..., min_length=4, max_length=255)
    area_name_norm: str = Field(..., min_length=2, max_length=255)
    area_name_display: Optional[str] = Field(None, max_length=255)
    size_category: Optional[SizeCategory] = None
    prop_sub_type: Optional[str] = Field(None, max_length=64)


class RentAlertOut(Attribution):
    id: UUID
    email: str
    area_name_norm: str
    area_name_display: Optional[str] = None
    size_category: Optional[str] = None
    prop_sub_type: Optional[str] = None
    is_active: bool = True


# ---------------------------------------------------------------------------
# Broker match wizard
# ---------------------------------------------------------------------------

GoalType = Literal["buy", "rent", "sell", "invest"]
BudgetBand = Literal["under_500k", "500k_1m", "1m_3m", "3m_5m", "5m_plus"]
LangPref = Literal["arabic", "english", "russian", "chinese", "hindi", "other"]


class BrokerMatchRequest(BaseModel):
    goal: GoalType
    preferred_area_norm: Optional[str] = Field(None, max_length=255)
    language: Optional[LangPref] = None
    budget_band: Optional[BudgetBand] = None


class BrokerMatchItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    broker_number: str
    full_name: str
    gender: Optional[str] = None
    real_estate_name: Optional[str] = None
    phone: Optional[str] = None
    webpage: Optional[str] = None
    license_start_date: Optional[date] = None
    license_end_date: Optional[date] = None
    is_active: bool
    detected_language: str
    company_size_active_brokers: int
    license_status: str  # active | expiring_soon | expired
    days_until_expiry: Optional[int] = None


class BrokerMatchResponse(Attribution):
    count: int
    items: List[BrokerMatchItem]


# ---------------------------------------------------------------------------
# Top firms leaderboard
# ---------------------------------------------------------------------------

class TopCompanyItem(BaseModel):
    real_estate_name: str
    active_broker_count: int


class TopCompaniesResponse(Attribution):
    count: int
    items: List[TopCompanyItem]


# ---------------------------------------------------------------------------
# Broker consultation request
# ---------------------------------------------------------------------------

class BrokerConsultationRequest(BaseModel):
    broker_number: str = Field(..., min_length=1, max_length=32)
    full_name: str = Field(..., min_length=2, max_length=255)
    whatsapp: str = Field(..., min_length=4, max_length=64)
    email: Optional[str] = Field(None, max_length=255)
    budget_band: Optional[BudgetBand] = None
    goal: Optional[GoalType] = None
    message: Optional[str] = Field(None, max_length=500)


class BrokerConsultationResponse(BaseModel):
    success: bool = True
    message: str
    broker_full_name: str
    broker_real_estate_name: Optional[str] = None
    lead_id: UUID


# ---------------------------------------------------------------------------
# Brokers
# ---------------------------------------------------------------------------

class DldBrokerItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    broker_number: str
    full_name: str
    gender: Optional[str] = None
    is_active: bool
    license_start_date: Optional[date] = None
    license_end_date: Optional[date] = None
    phone: Optional[str] = None
    webpage: Optional[str] = None
    real_estate_name: Optional[str] = None


class DldBrokersResponse(Attribution):
    count: int
    total_available: int
    items: List[DldBrokerItem]
