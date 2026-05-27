"""Areas API endpoints."""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.area import Area
from app.schemas.area import AreaResponse

router = APIRouter(prefix="/api/v1/areas", tags=["areas"])


@router.get("", response_model=List[AreaResponse])
async def list_areas(db: AsyncSession = Depends(get_db)):
    """Get all areas."""
    result = await db.execute(select(Area).order_by(Area.name))
    areas = result.scalars().all()
    return areas


@router.get("/{area_id}", response_model=AreaResponse)
async def get_area(area_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific area by ID."""
    result = await db.execute(select(Area).where(Area.id == area_id))
    area = result.scalar_one_or_none()
    
    if not area:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Area with id {area_id} not found"
        )
    
    return area
