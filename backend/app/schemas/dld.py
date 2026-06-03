"""Pydantic schemas for DLD-sourced endpoints."""
from __future__ import annotations

from datetime import date, datetime
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

class CanonicalAreaBbox(BaseModel):
    """Geographic bounding box. All four required when present so the client
    doesn't need to defend against half-populated boxes."""
    north: float
    south: float
    east: float
    west: float


class CanonicalAreaItem(BaseModel):
    id: UUID
    area_name: str
    area_name_upper: str
    area_name_slug: str
    area_name_ar: Optional[str] = None
    source_datasets: List[str]
    first_seen_year: Optional[int] = None
    occurrence_count: int
    # Geocoding payload — populated by scripts/overpass_geocoding.py +
    # scripts/improve_geocoding.py. ~86% of canonical areas have coords;
    # the rest are niche DLD admin sectors with no OSM presence.
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    bbox: Optional[CanonicalAreaBbox] = None
    # GeoJSON Polygon / MultiPolygon for map rendering. Coverage ~49% —
    # only areas matched against OSM admin boundaries have a polygon.
    polygon: Optional[dict] = None
    coords_source: Optional[str] = None
    coords_confidence: Optional[str] = None


class CanonicalAreasResponse(Attribution):
    count: int
    min_occurrences: int
    coords_coverage: int  # how many items in this response have lat/lng
    polygon_coverage: int  # how many items have a polygon shape
    items: List[CanonicalAreaItem]


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
    is_offplan: Optional[bool] = None
    creation_date: Optional[datetime] = None
    # Derived (computed at response-build time)
    total_annual_income: Optional[float] = None
    income_range_label: Optional[str] = None
    confidence: Optional[str] = None
    # Building type taxonomy (derived from name + sub-type + offplan flag).
    # Values: "tower" | "complex" | "villa_community" | "under_construction"
    building_type: Optional[str] = None
    building_type_label: Optional[str] = None
    building_type_emoji: Optional[str] = None
    # Building-name classification (from etl _building_classifier.py).
    # building_name_type ∈ real_building | sub_project | master_project |
    # developer_name | area_name | no_name. display_name is the
    # user-facing label the frontend should render in place of project_name.
    building_name_clean: Optional[str] = None
    building_name_type: Optional[str] = None
    display_name: Optional[str] = None
    is_identifiable: bool = False
    # Provenance — 'dld_official' for rows from the published buildings CSV,
    # 'ejari_derived' for synthetic per-(project, area) entities built from
    # the rent stream. Frontend renders different badges per source.
    data_source: Literal["dld_official", "ejari_derived"] = "dld_official"
    # Property category from the rent stream classifier — drives the 5-tab
    # buildings UI. Values: apartment / villa / hotel_apt / labor_camp /
    # office / retail / warehouse / whole_building / other. None when the
    # building hasn't been classified yet.
    property_category: Optional[str] = None
    # When project_name equals master_project the row is a community-wide
    # aggregate rather than a single tower. We surface a count of how many
    # records share the same (master_project, area) for the "5 towers in
    # this community" disclosure.
    is_community_aggregate: bool = False
    siblings_in_master_project: Optional[int] = None
    # Age in years from creation_date — None when creation_date is unknown.
    age_years: Optional[int] = None
    # vs-area benchmark. Negative = cheaper than the area median.
    rent_psf_vs_area_delta: Optional[float] = None
    rent_psf_vs_area_pct: Optional[float] = None
    area_median_rent_psf: Optional[float] = None
    # Demand signal — qualitative bucket from active_rent_count.
    # Values: "very_high" | "high" | "moderate" | "low"
    demand_signal: Optional[str] = None


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
    # True when the benchmark cell drew on <5 contracts. The cell is still
    # served (better signal than nothing) but the frontend renders a
    # "Limited data (N contracts)" caveat next to the verdict.
    low_confidence: bool = False
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
LangPref = Literal["arabic", "english", "russian", "chinese", "hindi", "filipino", "other"]


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
    # Estimated nationality from name patterns. NEVER verified — DLD does
    # not publish broker nationality data. UI must label this honestly.
    detected_nationality: Optional[str] = None
    nationality_flag: Optional[str] = None
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
    # Estimated nationality from name patterns — never verified.
    detected_nationality: Optional[str] = None
    detected_language: Optional[str] = None
    nationality_flag: Optional[str] = None


class DldBrokersResponse(Attribution):
    count: int
    total_available: int
    items: List[DldBrokerItem]


class BrokerNationalityBucket(BaseModel):
    nationality: str
    flag: str
    count: int
    language: str


class BrokerNationalityStats(Attribution):
    """Distribution of detected nationality across active brokers. Every
    bucket is an estimate from name patterns — UI must display the
    disclaimer alongside.
    """
    total: int
    estimated_disclaimer: str
    buckets: List[BrokerNationalityBucket]


# ---------------------------------------------------------------------------
# New endpoints — rent rankings, opportunities filter, similar areas,
# ROI calculator, market timing. All grounded in real DLD tables.
# ---------------------------------------------------------------------------

class RentRankingItem(BaseModel):
    area_name: str
    area_name_norm: str
    prop_sub_type: str
    size_band: str
    median_annual_rent: float
    median_rent_per_sqft: float
    p25_annual_rent: Optional[float] = None
    p75_annual_rent: Optional[float] = None
    sample_count: int


class RentRankingResponse(Attribution):
    direction: Literal["cheapest", "expensive"]
    size_category: str
    prop_sub_type: str
    count: int
    items: List[RentRankingItem]


class OpportunityFilteredItem(BaseModel):
    """A single area's opportunity card, DLD-grounded.

    Fields are derived directly from DLD tables — no fabrication. Sample
    counts travel with each metric so the client can fade low-confidence
    rows without us having to lie about the underlying data.
    """
    area_id: str
    area_name: str
    area_name_norm: str
    rank: int
    score: float  # 0-100, computed from the 5-component formula

    # Core metrics
    gross_yield_pct: Optional[float] = None
    rent_growth_yoy_pct: Optional[float] = None
    appreciation_5y_pct: Optional[float] = None
    cagr_5y_pct: Optional[float] = None
    median_price_per_sqft: Optional[float] = None
    transaction_count: int = 0

    # Supply + freehold + visa
    supply_risk: Optional[Literal["low", "medium", "high"]] = None
    offplan_pct: Optional[float] = None
    freehold_pct: Optional[float] = None  # area-level freehold share
    investor_visa_eligible: bool = False  # entry-price ≥ AED 750K freehold

    # Sample-trust signals
    sales_sample_count: int = 0
    rent_sample_count: int = 0
    confidence: Literal["low", "medium", "high"] = "low"

    # Why this rank (cited bullets)
    reasoning: List[str] = []


class OpportunityScoreFormula(BaseModel):
    """The exact weights used to compute `score`, returned to the client so
    the UI can show "How we score →" transparently."""
    yield_weight: float = 0.30
    rent_growth_weight: float = 0.25
    appreciation_weight: float = 0.20
    demand_weight: float = 0.15
    low_supply_risk_weight: float = 0.10


class OpportunitiesFilteredResponse(Attribution):
    goal: str
    risk: str
    budget_aed_max: Optional[float] = None
    property_type: Optional[str] = None
    count: int
    formula: OpportunityScoreFormula
    items: List[OpportunityFilteredItem]


class SimilarAreaItem(BaseModel):
    rank: int
    area_id: str
    area_name: str
    area_name_norm: str
    median_price_per_sqft: Optional[float] = None
    rental_yield_pct: Optional[float] = None
    similarity_score: float  # 0-1
    reason: str  # human-readable explanation


class SimilarAreasResponse(Attribution):
    source_area_name: str
    source_yield_pct: Optional[float] = None
    source_price_per_sqft: Optional[float] = None
    count: int
    items: List[SimilarAreaItem]


class MarketTimingSignal(BaseModel):
    label: str  # 'yield_trend' | 'price_position' | 'supply_pressure'
    value: str  # 'falling' | '15% below 5y peak' | 'high'
    tone: Literal["positive", "neutral", "negative"]
    detail: str


class MarketTimingResponse(Attribution):
    area_name: str
    area_name_norm: str
    verdict: Literal["good_time", "neutral", "caution"]
    confidence: Literal["low", "medium", "high"]
    headline: str  # short user-facing summary
    signals: List[MarketTimingSignal]
    reasoning: List[str]  # cited bullets
    # Raw numbers backing the verdict
    current_yield_pct: Optional[float] = None
    yield_5y_avg_pct: Optional[float] = None
    current_ppsf: Optional[float] = None
    ppsf_5y_peak: Optional[float] = None
    latest_offplan_pct: Optional[float] = None


# ---- ROI calculator ----

class RoiCalcMortgage(BaseModel):
    down_payment_pct: float = Field(20.0, ge=0, le=100)
    interest_rate_pct: float = Field(5.0, ge=0, le=20)
    term_years: int = Field(25, ge=1, le=40)


class RoiCalcRequest(BaseModel):
    area_name: str = Field(..., min_length=2, max_length=128)
    property_type: Literal["studio", "1br", "2br", "3br", "4br"] = "1br"
    size_sqm: float = Field(..., gt=0, lt=10000)
    purchase_price_aed: float = Field(..., gt=0)
    payment: Literal["cash", "mortgage"] = "cash"
    mortgage: Optional[RoiCalcMortgage] = None
    expected_annual_rent_aed: Optional[float] = Field(
        None, gt=0,
        description="Annual rent. If omitted, server uses DLD median for the area+size.",
    )
    service_charge_aed_per_sqft: Optional[float] = Field(None, ge=0)
    maintenance_pct: float = Field(1.0, ge=0, le=10)
    property_management_pct: float = Field(0.0, ge=0, le=20)
    vacancy_rate_pct: float = Field(5.0, ge=0, le=50)


class RoiCalcCostBreakdown(BaseModel):
    dld_transfer_aed: float
    agency_aed: float
    agency_vat_aed: float
    trustee_aed: float
    mortgage_registration_aed: float
    total_buying_cost_aed: float
    notes: List[str]


class RoiCalcRentalReturns(BaseModel):
    gross_rent_aed: float
    operating_expenses_aed: float
    net_rent_aed: float
    gross_yield_pct: float
    net_yield_pct: float
    monthly_cash_flow_aed: Optional[float] = None  # None for cash purchase
    annual_cash_flow_aed: Optional[float] = None


class RoiCalcCapitalGrowth(BaseModel):
    current_value_aed: float
    projected_value_5y_aed: float
    cagr_pct_used: float
    cagr_source: str  # 'DLD area CAGR' | 'Dubai market average'
    total_5y_return_aed: float
    total_5y_return_pct: float
    irr_estimate_pct: Optional[float] = None


class RoiCalcScenario(BaseModel):
    label: str  # 'Conservative' | 'Realistic' | 'Optimistic'
    annual_rent_aed: float
    net_yield_pct: float
    annual_cash_flow_aed: Optional[float] = None


class RoiCalcSensitivityItem(BaseModel):
    scenario: str  # 'Rent +10%' | 'Rate +1pp' | etc
    delta_annual_cash_flow_aed: Optional[float] = None
    delta_net_yield_pp: Optional[float] = None  # percentage points
    note: str


class RoiCalcBenchmark(BaseModel):
    your_value: float
    area_median: Optional[float] = None
    percentile_rank: Optional[float] = None  # 0-100 if computable
    verdict: str  # 'above area average', 'in-line', etc


class RoiCalcCurrency(BaseModel):
    code: str
    symbol: str
    price_local: float


class RoiCalcInsight(BaseModel):
    summary: str
    bullets: List[str]


class RoiCalcResponse(Attribution):
    # Echo of inputs for the PDF / share card
    area_name: str
    property_type: str
    size_sqm: float
    purchase_price_aed: float
    payment: str

    # Section 1: investment summary
    total_cash_needed_aed: float
    total_investment_inc_costs_aed: float

    # Section 2: rental returns
    rental_returns: RoiCalcRentalReturns

    # Section 3: capital growth
    capital_growth: RoiCalcCapitalGrowth

    # Section 4: payback
    payback_years: Optional[float] = None

    # Section 5: vs market benchmarks
    yield_vs_market: RoiCalcBenchmark
    price_vs_market: RoiCalcBenchmark

    # Section 6: 3 scenarios
    scenarios: List[RoiCalcScenario]

    # Section 7: sensitivity
    sensitivity: List[RoiCalcSensitivityItem]

    # Section 8: tax comparison — Dubai vs major investor home markets
    tax_advantages: List[str]
    effective_net_yield_after_tax_pct: float  # same as gross since zero tax

    # Section 9: currency conversion (indicative only — disclose)
    fx_rates_disclaimer: str
    currencies: List[RoiCalcCurrency]

    # Section 10: AI insight
    insight: RoiCalcInsight

    # Section 11/12: PDF/CTAs are frontend concerns — server just provides data

    # Cost breakdown (always returned)
    cost_breakdown: RoiCalcCostBreakdown

    # Defaults the server filled in (so client can show "auto-filled from DLD")
    defaults_used: dict


# ---------------------------------------------------------------------------
# Dashboard data — single-call aggregator for the Bloomberg-style dashboard
# ---------------------------------------------------------------------------
# All sections sourced from real DLD tables. Anything we don't have honest
# DLD data for (e.g. bedroom-type breakdown) is intentionally omitted
# rather than fabricated.

class DashboardTicker(BaseModel):
    """One-line auto-scroll ticker stats — short labels for the strip."""
    sales_2026_ytd: int
    volume_2026_aed: float
    top_yield_pct: Optional[float] = None
    top_5y_growth_pct: Optional[float] = None
    active_brokers: int
    areas_tracked: int


class DashboardKpi(BaseModel):
    label: str
    value: float
    unit: str  # 'count', 'aed', 'pct'
    sublabel: Optional[str] = None
    delta_pct: Optional[float] = None  # vs prior year, when computable
    delta_label: Optional[str] = None  # human-readable like "vs 2025"


class SalesCompositionSlice(BaseModel):
    label: str  # 'Off-Plan' | 'Ready'
    pct: float
    volume_aed: float
    transaction_count: int


class DashboardPriceHistoryPoint(BaseModel):
    year: int
    avg_ppsf_ready: Optional[float] = None
    avg_ppsf_offplan: Optional[float] = None
    avg_ppsf_all: Optional[float] = None
    transaction_count: int


class TopAreaItem(BaseModel):
    rank: int
    area_name: str
    value: float  # primary metric (yield %, appreciation %, rent growth %, etc)
    secondary: Optional[float] = None  # e.g. cagr alongside cumulative
    sample_count: Optional[int] = None


class ActivityPoint(BaseModel):
    """Yearly transaction activity. DLD aggregates are yearly, not monthly —
    a true monthly heatmap would require the raw transactions table."""
    year: int
    transaction_count: int
    volume_aed: float
    offplan_count: int
    ready_count: int


class YieldTrendPoint(BaseModel):
    year: int
    avg_gross_yield_pct: float
    area_count: int  # how many areas contributed to this average


class SupplyPipelineItem(BaseModel):
    rank: int
    area_name: str
    project_count: int
    total_units: Optional[int] = None  # sum of flats across projects
    offplan_pct: Optional[float] = None  # % of projects flagged off-plan


class BrokerLicensePoint(BaseModel):
    year: int
    new_licenses: int


class BrokerFirmItem(BaseModel):
    rank: int
    firm_name: str
    broker_count: int


class BrokerStats(BaseModel):
    licenses_per_year: List[BrokerLicensePoint]
    top_firms: List[BrokerFirmItem]
    total_active: int


class DataIntelligenceFooter(BaseModel):
    last_updated: str  # ISO date
    records_analyzed: int
    data_sources: List[str]
    next_update: Optional[str] = None
    confidence: str  # 'high'


class DashboardDataResponse(Attribution):
    """Single Redis-cached payload (1h) feeding the entire dashboard.

    Sections are deliberately conservative: every number traces back to a
    DLD ETL table. Sections without honest underlying data (e.g. a true
    monthly transactions heatmap, bedroom-type split) are absent rather
    than mocked.
    """
    ticker: DashboardTicker
    kpis: List[DashboardKpi]
    sales_composition: List[SalesCompositionSlice]
    sales_composition_total_aed: float
    price_history: List[DashboardPriceHistoryPoint]
    top_yield_areas: List[TopAreaItem]
    top_appreciation_areas: List[TopAreaItem]
    activity: List[ActivityPoint]
    rent_growth_leaders: List[TopAreaItem]
    yield_trend: List[YieldTrendPoint]
    yield_trend_direction: Optional[str] = None  # 'rising' | 'falling' | 'flat'
    supply_pipeline: List[SupplyPipelineItem]
    broker_stats: BrokerStats
    intelligence: DataIntelligenceFooter
    cached: bool = False


# ---------------------------------------------------------------------------
# Building rent history (5y)
# ---------------------------------------------------------------------------

class BuildingRentHistoryPoint(BaseModel):
    year: int
    avg_annual_rent: Optional[float] = None
    median_annual_rent: Optional[float] = None
    avg_rent_per_sqft: Optional[float] = None
    contract_count: int = 0
    new_count: int = 0
    renew_count: int = 0


class DldBuildingRentHistoryResponse(Attribution):
    building_id: UUID
    project_name: Optional[str] = None
    area_name: Optional[str] = None
    points: List[BuildingRentHistoryPoint]
    years_of_history: int = 0


# ---------------------------------------------------------------------------
# Availability Tracker
# ---------------------------------------------------------------------------

class UpcomingAvailabilityItem(BaseModel):
    property_sub_type: str  # Studio / 1BR / 2BR / 3BR / 4BR / 5BR+ / Other
    contract_count: int
    estimated_available: int
    avg_last_rent: Optional[float] = None
    renewal_probability_pct: Optional[float] = None


class UpcomingAvailabilityResponse(Attribution):
    area_name_norm: str
    area_name_display: str
    window_days: int  # 30 / 60 / 90
    horizon_month_end: str  # 'YYYY-MM'
    total_expiring: int
    total_estimated_available: int
    by_sub_type: List[UpcomingAvailabilityItem]


class LeaseExpiryMonthBucket(BaseModel):
    expiry_month: str  # 'YYYY-MM'
    contract_count: int
    estimated_available: int
    avg_last_rent: Optional[float] = None
    renewal_probability_pct: Optional[float] = None


class BuildingLeaseExpiryResponse(Attribution):
    building_id: UUID
    project_name: Optional[str] = None
    area_name: Optional[str] = None
    months: List[LeaseExpiryMonthBucket]
    total_expiring: int
    total_estimated_available: int


# ---------------------------------------------------------------------------
# Lifestyle Score
# ---------------------------------------------------------------------------

class AreaLifestyleScoreResponse(Attribution):
    area_name_norm: str
    area_name_display: Optional[str] = None
    metro_score: Optional[float] = None
    mall_score: Optional[float] = None
    landmark_score: Optional[float] = None
    overall_score: Optional[float] = None
    nearest_metro: Optional[str] = None
    nearest_mall: Optional[str] = None
    nearest_landmark: Optional[str] = None
    metro_stations_count: int = 0


# ---------------------------------------------------------------------------
# Bedroom benchmarks (per-bedroom sale price by area + reg_type + year)
# ---------------------------------------------------------------------------

class BedroomBenchmarkRow(BaseModel):
    bedroom_type: str   # Studio / 1BR / 2BR / 3BR / 4BR / 5BR+ / Penthouse / Single Room
    reg_type: str       # ready / off_plan
    year: int
    avg_price_aed: Optional[float] = None
    median_price_aed: Optional[float] = None
    avg_ppsf: Optional[float] = None
    transaction_count: int


class AreaBedroomPricesResponse(Attribution):
    area_name_norm: str
    area_name_display: Optional[str] = None
    rows: List[BedroomBenchmarkRow]
    total_rows: int


# ---------------------------------------------------------------------------
# Building sales history
# ---------------------------------------------------------------------------

class AreaCategoryBreakdownItem(BaseModel):
    property_category: str
    label: str
    emoji: str
    building_count: int


class AreaCategoryBreakdownResponse(Attribution):
    area_name_norm: str
    area_name_display: Optional[str] = None
    total_buildings: int
    items: List[AreaCategoryBreakdownItem]


# ---------------------------------------------------------------------------
# Communities — master_project_en aggregates from dld_buildings_derived
# ---------------------------------------------------------------------------

class DldCommunityItem(BaseModel):
    """One master-planned community aggregate (DAMAC Hills, JVC, etc.).
    Roll-up of all dld_buildings_derived rows that share the same
    master_project_en value."""
    slug: str
    master_project: str
    primary_area_name: Optional[str] = None
    area_count: int
    building_count: int
    total_contracts: int
    avg_annual_rent: Optional[float] = None
    total_annual_income: Optional[float] = None
    income_range_label: Optional[str] = None
    confidence: str


class DldCommunitiesResponse(Attribution):
    count: int
    total_available: int
    items: List[DldCommunityItem]


class BuildingSalesResponse(Attribution):
    id: UUID
    building_name_en: str
    building_name_slug: str
    area_name_en: Optional[str] = None
    master_project_en: Optional[str] = None
    total_transactions: int
    avg_sale_price_ready: Optional[float] = None
    avg_sale_price_offplan: Optional[float] = None
    avg_ppsf_ready: Optional[float] = None
    avg_ppsf_offplan: Optional[float] = None
    median_sale_price: Optional[float] = None
    min_sale_price: Optional[float] = None
    max_sale_price: Optional[float] = None
    years_covered: int
    first_seen_year: Optional[int] = None
    last_seen_year: Optional[int] = None
    last_transaction_date: Optional[date] = None
    parking_pct: Optional[float] = None
    bulk_transaction_count: int = 0


# ---------------------------------------------------------------------------
# Dashboard pulse — single-call aggregator for the dashboard widgets
# ---------------------------------------------------------------------------

class MarketOverviewMetric(BaseModel):
    """One headline metric for the dashboard market overview. Pure facts —
    no tone, no sentiment scoring. Investors read the number and decide."""
    name: str
    value: str        # display form, e.g. "59,601", "6.98%", "+8.3% YoY"
    period: Optional[str] = None  # e.g. "Jan–May 2026"


class MarketOverview(BaseModel):
    """Neutral facts panel that replaces the old BULLISH/BEARISH headline.

    The frontend renders the metrics as plain rows with no color coding
    and no aggregate verdict — the user wants raw data, not opinions.
    """
    period_label: str   # e.g. "Dubai Market · June 2026"
    metrics: List[MarketOverviewMetric]
    source: str         # "DLD Official Data"


class ScatterMatrixPoint(BaseModel):
    area_name_norm: str
    area_name_display: str
    yield_pct: float                  # Y axis
    appreciation_5y_pct: float        # X axis
    sample_score: int                 # min(sales, contracts) — used for dot size
    quadrant: Literal["best_investment", "income_focus", "growth_focus", "avoid"]


class RentVsBuyGauge(BaseModel):
    payback_years: float
    signal: Literal["buy", "neutral", "rent"]
    based_on_areas: int
    avg_sale_price_aed: float
    avg_annual_rent_aed: float


class HotAreaItem(BaseModel):
    area_name_norm: str
    area_name_display: str
    txn_count_latest: int
    txn_count_prior: int
    pct_change_yoy: float
    trend: Literal["up", "down", "flat"]


class OffplanArea(BaseModel):
    area_name_norm: str
    area_name_display: str
    offplan_count: int
    offplan_volume_aed: float
    offplan_share_pct: float           # offplan_count / total_count in area


class OffplanPipeline(BaseModel):
    total_offplan_volume_aed: float
    total_offplan_count: int
    top_areas: List[OffplanArea]


class DataFreshness(BaseModel):
    transactions_year_range: str        # "2021–2026"
    rents_year_range: str
    snapshot_date: str
    last_etl_run: str


class DashboardPulseResponse(Attribution):
    market_overview: MarketOverview
    matrix_points: List[ScatterMatrixPoint]
    rent_vs_buy: Optional[RentVsBuyGauge] = None
    hot_areas: List[HotAreaItem]
    offplan: Optional[OffplanPipeline] = None
    freshness: DataFreshness
