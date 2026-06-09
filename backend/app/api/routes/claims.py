"""Public 'Claim this profile' intake (PART 7) — functional, NO payment.

A claim is a pending request to own a broker / agency / developer profile. An
admin reviews it in /admin/claims and, on approval, the matching profile is
created/linked and marked verified. Payment gating comes later.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_types import ClaimType
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import DldReraBroker
from app.models.dld_project import DldProject
from app.models.monetization import AccountClaim
from app.schemas.monetization import ClaimCreate, ClaimCreateResponse

router = APIRouter(
    prefix="/api/v1/claims",
    tags=["claims"],
    dependencies=[Depends(rate_limit_dependency)],
)


async def _resolve_target_name(db: AsyncSession, claim_type: str, target_id: str) -> str | None:
    """Best-effort display name for the claimed entity (helps admins review)."""
    if claim_type == ClaimType.BROKER.value:
        row = (await db.execute(
            select(DldReraBroker.full_name).where(DldReraBroker.broker_number == target_id)
        )).scalar_one_or_none()
        return row
    if claim_type == ClaimType.DEVELOPER.value:
        row = (await db.execute(
            select(DldProject.developer_name).where(DldProject.developer_number == target_id).limit(1)
        )).scalar_one_or_none()
        return row
    return None


@router.post("", response_model=ClaimCreateResponse, status_code=201)
async def submit_claim(payload: ClaimCreate, db: AsyncSession = Depends(get_db)) -> ClaimCreateResponse:
    target_name = payload.target_name or await _resolve_target_name(
        db, payload.claim_type.value, payload.target_id
    )
    claim = AccountClaim(
        claim_type=payload.claim_type.value,
        target_id=payload.target_id.strip(),
        target_name=target_name,
        claimant_name=payload.claimant_name.strip(),
        claimant_email=payload.claimant_email,
        claimant_phone=(payload.claimant_phone or "").strip() or None,
        claimant_company=(payload.claimant_company or "").strip() or None,
        message=(payload.message or "").strip() or None,
        status="pending",
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    return ClaimCreateResponse(claim_id=claim.id)
