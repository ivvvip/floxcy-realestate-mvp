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


class AreaStatsResponse(BaseModel):
    """Schema for aggregated area stats."""
    total_count: int
    count_by_type: Dict[str, int]
    area_names: List[str]
