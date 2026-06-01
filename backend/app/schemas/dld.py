"""Pydantic schemas for DLD-sourced endpoints."""
from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


DATA_SOURCE = "Dubai Land Department Open Data"
LAST_UPDATED = "2026-06-01"

# Per-area presentation rules (locked by spec)
MIN_RELIABLE_SAMPLES = 30
DISPLAY_YIELD_CAP_PCT = 25.0


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


class DldAreaDetail(DldAreaListItem):
    building_count: int = 0
    avg_price_per_sqft: Optional[float] = None
    avg_annual_rent: Optional[float] = None
    avg_rent_per_sqft: Optional[float] = None


class DldAreaDetailResponse(Attribution):
    area: DldAreaDetail


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


class DldBuildingsResponse(Attribution):
    count: int
    total_available: int
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

    @model_validator(mode="after")
    def _must_have_size(self) -> "RentCheckRequest":
        if self.size_sqm is None and self.size_category is None:
            raise ValueError("Provide either size_sqm or size_category")
        return self


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
    suggested_areas: List[RentCheckSuggestion] = []


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
