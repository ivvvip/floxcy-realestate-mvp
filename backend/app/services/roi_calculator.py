"""ROI calculation service."""
from app.schemas.roi import ROICalculateRequest, ROICalculateResponse


def calculate_roi(data: ROICalculateRequest) -> ROICalculateResponse:
    """Calculate gross and net rental yield."""
    
    total_costs = data.service_charges + data.maintenance_cost + data.other_costs
    annual_net_income = data.annual_rent - total_costs
    
    gross_yield = (data.annual_rent / data.property_price) * 100
    net_yield = (annual_net_income / data.property_price) * 100
    
    payback_years = None
    if annual_net_income > 0:
        payback_years = round(data.property_price / annual_net_income, 1)
    
    interpretation = _get_interpretation(net_yield)
    
    return ROICalculateResponse(
        property_price=data.property_price,
        annual_rent=data.annual_rent,
        total_costs=total_costs,
        annual_net_income=annual_net_income,
        gross_yield=round(gross_yield, 2),
        net_yield=round(net_yield, 2),
        payback_years=payback_years,
        interpretation=interpretation,
    )


def _get_interpretation(net_yield: float) -> str:
    """Provide investment interpretation."""
    if net_yield >= 8:
        return "Excellent yield - high return potential"
    elif net_yield >= 6:
        return "Good yield - solid investment"
    elif net_yield >= 4:
        return "Moderate yield - average return"
    elif net_yield >= 2:
        return "Low yield - consider alternatives"
    else:
        return "Very low yield - high risk or overpriced"
