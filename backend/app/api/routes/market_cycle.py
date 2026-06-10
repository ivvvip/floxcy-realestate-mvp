"""Market Cycle Phase — where is the Dubai market in the cycle?

Serves the pre-computed signals + rule-based phase from
scripts/build_market_cycle.py. Cycle phase is interpretive: every consumer must
show the "interpretation, not a prediction" caveat carried in `meta.note`.
"""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.rate_limit import rate_limit_dependency

router = APIRouter(
    prefix="/api/v1/dld",
    tags=["market-cycle"],
    dependencies=[Depends(rate_limit_dependency)],
)

_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "market_cycle.json"
_CACHE: Optional[dict] = None


def load_market_cycle() -> Optional[dict]:
    global _CACHE
    if _CACHE is None and _PATH.exists():
        try:
            _CACHE = json.loads(_PATH.read_text())
        except (OSError, ValueError):
            _CACHE = None
    return _CACHE


@router.get("/market-cycle")
async def get_market_cycle() -> dict:
    data = load_market_cycle()
    if not data:
        raise HTTPException(status_code=503, detail="Market cycle data not available")
    return data
