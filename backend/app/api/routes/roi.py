"""ROI calculation endpoints."""
from fastapi import APIRouter

from app.schemas.roi import ROICalculateRequest, ROICalculateResponse
from app.services.roi_calculator import calculate_roi

router = APIRouter(prefix="/api/v1/roi", tags=["roi"])


@router.post("/calculate", response_model=ROICalculateResponse)
async def calculate_roi_endpoint(data: ROICalculateRequest):
    """Calculate ROI for a real estate investment.
    
    Returns gross yield, net yield, and investment interpretation.
    """
    return calculate_roi(data)
