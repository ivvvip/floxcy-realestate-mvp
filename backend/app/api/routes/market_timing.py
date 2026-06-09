"""Dubai Market Timing — city-level seasonal buy/sell intelligence.

Serves the pre-computed, statistically-verified dataset built by
scripts/build_market_timing.py (backend/data/market_timing.json). CITY-LEVEL
ONLY by design — per-area monthly timing is statistical noise and is never
exposed here.
"""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.rate_limit import rate_limit_dependency

router = APIRouter(
    prefix="/api/v1/dld",
    tags=["market-timing"],
    dependencies=[Depends(rate_limit_dependency)],
)

_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "market_timing.json"
_CACHE: Optional[dict] = None


def load_market_timing() -> Optional[dict]:
    """Load + memoize the timing dataset. Returns None if the file is absent."""
    global _CACHE
    if _CACHE is None and _PATH.exists():
        try:
            _CACHE = json.loads(_PATH.read_text())
        except (OSError, ValueError):
            _CACHE = None
    return _CACHE


@router.get("/market-timing")
async def get_market_timing() -> dict:
    data = load_market_timing()
    if not data:
        raise HTTPException(status_code=503, detail="Market timing data not available")
    return data
