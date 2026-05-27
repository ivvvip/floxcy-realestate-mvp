"""Admin endpoints (token-protected)."""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.seed_data import seed_snapshots_with_session

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def verify_admin_token(x_admin_token: str | None = Header(default=None)):
    if not x_admin_token or x_admin_token != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Admin-Token header",
        )


@router.post("/seed", dependencies=[Depends(verify_admin_token)])
async def reseed_market_snapshots(db: AsyncSession = Depends(get_db)):
    """Re-seed market snapshots (clears existing, inserts 12 monthly per area)."""
    summary = await seed_snapshots_with_session(db)
    return {"status": "ok", **summary}
