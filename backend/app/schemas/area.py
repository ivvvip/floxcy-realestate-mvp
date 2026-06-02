"""Area Pydantic schemas."""
from datetime import datetime
from uuid import UUID
from typing import Optional, Dict, List
from pydantic import BaseModel, Field, ConfigDict


class AreaBase(BaseModel):
    """Base schema for Area."""
    name: str = Field(..., min_length=1, max_length=255, description="Area name in English")
    name_arabic: Optional[str] = Field(None, max_length=255, description="Area name in Arabic")
    city: str = Field("Dubai", max_length=100)
    emirate: str = Field("Dubai", max_length=100)
    description: Optional[str] = Field(None, description="Area description")
    area_type: str = Field("residential", description="residential, commercial, or mixed")
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)


class AreaCreate(AreaBase):
    """Schema for creating a new area."""
    pass


class AreaUpdate(BaseModel):
    """Schema for updating an area."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    name_arabic: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    area_type: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)


class AreaResponse(AreaBase):
    """Schema for area response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class AreaListItem(AreaResponse):
    """Area in list view with latest snapshot metrics inline."""
    latest_price_per_sqft: Optional[float] = None
    latest_yield: Optional[float] = None
    appreciation_1y: Optional[float] = None
    investment_score: Optional[float] = None


class AreaStatsResponse(BaseModel):
    """Schema for aggregated area stats.

    `total_count` reflects all areas tracked (DLD coverage). `curated_count`
    reflects the editorially curated subset that powers the existing
    /api/v1/areas list.
    """
    total_count: int
    curated_count: int = 0
    count_by_type: Dict[str, int]
    area_names: List[str]
    data_source: str = "Dubai Land Department Open Data"
    last_updated: str = "2026-06-01"


class AreaSnapshotPoint(BaseModel):
    """One point in an area's price/yield history."""
    snapshot_date: str  # YYYY-MM-DD
    avg_price_per_sqft: float
    avg_sale_price: float
    rental_yield: float


class AreaLatestSnapshot(BaseModel):
    """Latest snapshot metrics for an area."""
    snapshot_date: str
    avg_sale_price: float
    avg_price_per_sqft: float
    avg_annual_rent: float
    rental_yield: float
    occupancy_rate: Optional[float] = None
    appreciation_1y: Optional[float] = None
    appreciation_3y: Optional[float] = None
    transaction_volume: Optional[int] = None
    demand_score: Optional[float] = None
    risk_score: Optional[float] = None
    investment_score: Optional[float] = None


class AreaDldBlock(BaseModel):
    """DLD-sourced metrics for an area (matched via dld_areas.curated_area_id)."""
    dld_area_id: UUID
    dld_name: str
    median_price_per_sqft: Optional[float] = None
    median_annual_rent: Optional[float] = None
    median_rent_per_sqft: Optional[float] = None
    avg_price_per_sqft: Optional[float] = None
    avg_annual_rent: Optional[float] = None
    avg_rent_per_sqft: Optional[float] = None
    rental_yield_pct: Optional[float] = None
    rent_growth_yoy_pct: Optional[float] = None
    sales_count: int = 0
    rent_count_2026: int = 0
    building_count: int = 0
    confidence: str = "low"
    # From dld_area_land_summary (land_registry ETL)
    freehold_pct: Optional[float] = None
    registered_pct: Optional[float] = None
    total_parcels: Optional[int] = None
    land_type_mix: Optional[dict] = None   # {"Residential": 23.0, "Commercial": 57.0, ...}


# -----------------------------------------------------------------------------
# Universal area coverage — for the 362-area screener
# -----------------------------------------------------------------------------

class AreaCoverageItem(BaseModel):
    """One row of the universal area list.

    Curated areas keep their UUID and area_type. DLD-only areas use the
    DldArea UUID and a default type. `slug` is always the URL-safe lookup
    token (UUID for curated; name_norm for DLD-only so URLs read naturally
    like /areas/business-bay).
    """
    id: UUID  # Area.id when curated, DldArea.id when DLD-only
    slug: str
    name: str
    name_arabic: Optional[str] = None
    area_type: str = "residential"
    city: str = "Dubai"
    emirate: str = "Dubai"
    # Coverage tier: full → has MarketSnapshot AND solid DLD overlay
    #                partial → has DLD metrics meeting confidence threshold
    #                limited → has DLD metrics but thin samples
    #                none    → DLD area exists but no metrics yet
    coverage_tier: str = "none"
    is_curated: bool = False
    # Headline metrics so the screener can sort/filter without an N+1
    median_price_per_sqft: Optional[float] = None
    rental_yield_pct: Optional[float] = None
    rent_growth_yoy_pct: Optional[float] = None
    sales_count: int = 0
    rent_count_2026: int = 0
    investment_score: Optional[float] = None
    appreciation_1y: Optional[float] = None


class AreaCoverageResponse(BaseModel):
    total: int
    counts: Dict[str, int]  # by coverage_tier
    items: List[AreaCoverageItem]
    data_source: str = "Dubai Land Department Open Data + Floxcy curated set"
    last_updated: str = "2026-06-01"


# -----------------------------------------------------------------------------
# Limited-data detail (for DLD-only areas in /areas/[slug])
# -----------------------------------------------------------------------------

class AreaLimitedDetail(BaseModel):
    """Detail payload for a DLD-only area — no MarketSnapshot history."""
    id: UUID
    slug: str
    name: str
    coverage_tier: str = "limited"
    dld: AreaDldBlock
    data_source: str = "Dubai Land Department Open Data"
    last_updated: str = "2026-06-01"


# -----------------------------------------------------------------------------
# Admin coverage stats
# -----------------------------------------------------------------------------

class AreaCoverageStats(BaseModel):
    total_areas: int
    curated_count: int
    dld_only_count: int
    by_tier: Dict[str, int]
    samples_total_sales: int
    samples_total_rents: int
    area_gaps: List[str]  # DLD areas with zero metrics — sorted by name
    data_source: str = "Dubai Land Department Open Data"
    last_updated: str = "2026-06-01"


class AreaDetailResponse(AreaResponse):
    """Area detail: base info + latest snapshot + 12-month history + DLD overlay."""
    latest: Optional[AreaLatestSnapshot] = None
    history: List[AreaSnapshotPoint] = []
    dld: Optional[AreaDldBlock] = None
    data_source: str = "Dubai Land Department Open Data"
    last_updated: str = "2026-06-01"
