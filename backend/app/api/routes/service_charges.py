"""Per-area service-charge ESTIMATES (for the editable Net-Yield widget).

Serves the pre-computed defaults from scripts/build_service_charges.py. These
are estimates (classified from DLD-published ranges by area avg price/sqft, with
a villa override) — the UI lets users adjust and always labels them as
"verify via DLD Service Charge Index / Mollak".
"""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.rate_limit import rate_limit_dependency

router = APIRouter(
    prefix="/api/v1/dld",
    tags=["service-charges"],
    dependencies=[Depends(rate_limit_dependency)],
)

_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "service_charges.json"
_CACHE: Optional[dict] = None


def load_service_charges() -> Optional[dict]:
    global _CACHE
    if _CACHE is None and _PATH.exists():
        try:
            _CACHE = json.loads(_PATH.read_text())
        except (OSError, ValueError):
            _CACHE = None
    return _CACHE


@router.get("/service-charges")
async def get_service_charges() -> dict:
    data = load_service_charges()
    if not data:
        raise HTTPException(status_code=503, detail="Service-charge estimates not available")
    return data
