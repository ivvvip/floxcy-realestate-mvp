"""UAE residence-visa eligibility (rule-based on property value).

Serves the pre-computed per-area distribution from
scripts/build_visa_eligibility.py. Eligibility itself is a pure rule
(price ≥ threshold); the per-area percentages come from our own DLD sales.
Every consumer must show the "verify with DLD/ICP" caveat carried in `meta`.
"""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.rate_limit import rate_limit_dependency

router = APIRouter(
    prefix="/api/v1/dld",
    tags=["visa"],
    dependencies=[Depends(rate_limit_dependency)],
)

_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "visa_eligibility.json"
_CACHE: Optional[dict] = None


def load_visa() -> Optional[dict]:
    global _CACHE
    if _CACHE is None and _PATH.exists():
        try:
            _CACHE = json.loads(_PATH.read_text())
        except (OSError, ValueError):
            _CACHE = None
    return _CACHE


@router.get("/visa-eligibility")
async def get_visa_eligibility() -> dict:
    data = load_visa()
    if not data:
        raise HTTPException(status_code=503, detail="Visa eligibility data not available")
    return data
