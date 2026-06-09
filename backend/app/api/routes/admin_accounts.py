"""Admin monetization controls (PART 6) — accounts, subscriptions, claims.

All endpoints are admin-gated. This is the manual control surface used until
Stripe is activated: admins approve claims, flip verified/featured, and set
subscription tiers by hand. No payment processing here.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_types import CLAIM_TYPE_TO_ACCOUNT, ClaimStatus, ClaimType
from app.core.dependencies import AuthPrincipal, require_admin
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld_project import DldProject
from app.models.monetization import (
    AccountClaim, AgencyProfile, BrokerProfile, DeveloperAccount,
)
from app.models.user import User
from app.schemas.monetization import (
    AccountsOverview, AgencyProfileOut, BrokerProfileOut, ClaimOut,
    ClaimReviewRequest, DeveloperAccountOut, ProfilePatch, SubscriptionRow,
    SubscriptionsOverview, UserSubscriptionPatch,
)

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin-monetization"],
    dependencies=[Depends(rate_limit_dependency), Depends(require_admin)],
)


# ---------------------------------------------------------------------------
# Accounts overview (PART 6: view all account types)
# ---------------------------------------------------------------------------

@router.get("/accounts", response_model=AccountsOverview)
async def list_accounts(db: AsyncSession = Depends(get_db)) -> AccountsOverview:
    brokers = (await db.execute(select(BrokerProfile).order_by(BrokerProfile.created_at.desc()))).scalars().all()
    agencies = (await db.execute(select(AgencyProfile).order_by(AgencyProfile.created_at.desc()))).scalars().all()
    developers = (await db.execute(select(DeveloperAccount).order_by(DeveloperAccount.created_at.desc()))).scalars().all()
    return AccountsOverview(
        brokers=[BrokerProfileOut.model_validate(b) for b in brokers],
        agencies=[AgencyProfileOut.model_validate(a) for a in agencies],
        developers=[DeveloperAccountOut.model_validate(d) for d in developers],
        counts={
            "brokers": len(brokers),
            "agencies": len(agencies),
            "developers": len(developers),
            "brokers_verified": sum(1 for b in brokers if b.is_verified),
            "brokers_featured": sum(1 for b in brokers if b.is_featured),
            "agencies_verified": sum(1 for a in agencies if a.is_verified),
            "developers_verified": sum(1 for d in developers if d.is_verified),
        },
    )


# ---------------------------------------------------------------------------
# Subscriptions overview (PART 6: status overview)
# ---------------------------------------------------------------------------

@router.get("/subscriptions", response_model=SubscriptionsOverview)
async def subscriptions_overview(db: AsyncSession = Depends(get_db)) -> SubscriptionsOverview:
    rows: list[SubscriptionRow] = []

    users = (await db.execute(select(User))).scalars().all()
    for u in users:
        rows.append(SubscriptionRow(
            kind="user", id=u.id, name=u.username, account_or_tier=u.account_type,
            status=u.subscription_status, is_paid=u.is_paid, subscription_end=u.subscription_end,
        ))
    for b in (await db.execute(select(BrokerProfile))).scalars().all():
        rows.append(SubscriptionRow(
            kind="broker", id=b.id, name=b.broker_number, account_or_tier=b.subscription_tier,
            status="verified" if b.is_verified else "unverified", is_paid=b.is_featured,
        ))
    for a in (await db.execute(select(AgencyProfile))).scalars().all():
        rows.append(SubscriptionRow(
            kind="agency", id=a.id, name=a.agency_name, account_or_tier=a.subscription_tier,
            status="verified" if a.is_verified else "unverified", is_paid=a.is_featured,
        ))
    for d in (await db.execute(select(DeveloperAccount))).scalars().all():
        rows.append(SubscriptionRow(
            kind="developer", id=d.id, name=d.developer_name or d.developer_number,
            account_or_tier=d.subscription_tier,
            status="verified" if d.is_verified else "unverified", is_paid=d.lead_access,
        ))

    return SubscriptionsOverview(
        rows=rows,
        counts={
            "total": len(rows),
            "paid_users": sum(1 for r in rows if r.kind == "user" and r.is_paid),
            "active_users": sum(1 for r in rows if r.kind == "user" and r.status == "active"),
            "trial_users": sum(1 for r in rows if r.kind == "user" and r.status == "trial"),
            "profiles": sum(1 for r in rows if r.kind != "user"),
        },
    )


# ---------------------------------------------------------------------------
# Claims (PART 6/7: pending verifications)
# ---------------------------------------------------------------------------

@router.get("/claims", response_model=list[ClaimOut])
async def list_claims(
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
) -> list[ClaimOut]:
    stmt = select(AccountClaim).order_by(AccountClaim.created_at.desc())
    if status_filter:
        stmt = stmt.where(AccountClaim.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return [ClaimOut.model_validate(r) for r in rows]


async def _get_claim(db: AsyncSession, claim_id: UUID) -> AccountClaim:
    claim = (await db.execute(select(AccountClaim).where(AccountClaim.id == claim_id))).scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim


@router.post("/claims/{claim_id}/approve", response_model=ClaimOut)
async def approve_claim(
    claim_id: UUID,
    body: ClaimReviewRequest = ClaimReviewRequest(),
    db: AsyncSession = Depends(get_db),
    admin: AuthPrincipal = Depends(require_admin),
) -> ClaimOut:
    """Approve a claim → create/link the matching profile (verified), and mark
    the claim approved. No payment; tier defaults to the entry tier and is
    adjusted manually afterward."""
    claim = await _get_claim(db, claim_id)
    if claim.status == ClaimStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="Claim already approved")

    now = datetime.utcnow()
    ct = claim.claim_type

    if ct == ClaimType.BROKER.value:
        existing = (await db.execute(
            select(BrokerProfile).where(BrokerProfile.broker_number == claim.target_id)
        )).scalar_one_or_none()
        if existing:
            existing.is_verified = True
            existing.claimed_at = existing.claimed_at or now
        else:
            db.add(BrokerProfile(
                broker_number=claim.target_id, is_verified=True, claimed_at=now,
                email=claim.claimant_email, phone=claim.claimant_phone,
                subscription_tier=CLAIM_TYPE_TO_ACCOUNT[ct],
            ))
    elif ct == ClaimType.DEVELOPER.value:
        existing = (await db.execute(
            select(DeveloperAccount).where(DeveloperAccount.developer_number == claim.target_id)
        )).scalar_one_or_none()
        if existing:
            existing.is_verified = True
            existing.claimed_at = existing.claimed_at or now
        else:
            db.add(DeveloperAccount(
                developer_number=claim.target_id, developer_name=claim.target_name,
                is_verified=True, claimed_at=now, subscription_tier=CLAIM_TYPE_TO_ACCOUNT[ct],
            ))
    elif ct == ClaimType.AGENCY.value:
        existing = (await db.execute(
            select(AgencyProfile).where(AgencyProfile.real_estate_number == claim.target_id)
        )).scalar_one_or_none()
        if existing:
            existing.is_verified = True
            existing.claimed_at = existing.claimed_at or now
        else:
            db.add(AgencyProfile(
                real_estate_number=claim.target_id,
                agency_name=claim.target_name or claim.claimant_company or claim.target_id,
                is_verified=True, claimed_at=now, subscription_tier=CLAIM_TYPE_TO_ACCOUNT[ct],
            ))
    else:
        raise HTTPException(status_code=422, detail=f"Unknown claim_type '{ct}'")

    claim.status = ClaimStatus.APPROVED.value
    claim.reviewed_by = admin.user_id
    claim.reviewed_at = now
    claim.review_note = (body.note or "").strip() or None
    await db.commit()
    await db.refresh(claim)
    return ClaimOut.model_validate(claim)


@router.post("/claims/{claim_id}/reject", response_model=ClaimOut)
async def reject_claim(
    claim_id: UUID,
    body: ClaimReviewRequest = ClaimReviewRequest(),
    db: AsyncSession = Depends(get_db),
    admin: AuthPrincipal = Depends(require_admin),
) -> ClaimOut:
    claim = await _get_claim(db, claim_id)
    claim.status = ClaimStatus.REJECTED.value
    claim.reviewed_by = admin.user_id
    claim.reviewed_at = datetime.utcnow()
    claim.review_note = (body.note or "").strip() or None
    await db.commit()
    await db.refresh(claim)
    return ClaimOut.model_validate(claim)


# ---------------------------------------------------------------------------
# Manual profile / subscription controls (until Stripe is activated)
# ---------------------------------------------------------------------------

def _apply_profile_patch(profile, patch: ProfilePatch, *, allow_lead_access: bool) -> None:
    if patch.is_verified is not None and hasattr(profile, "is_verified"):
        profile.is_verified = patch.is_verified
    if patch.is_featured is not None and hasattr(profile, "is_featured"):
        profile.is_featured = patch.is_featured
    if patch.subscription_tier is not None:
        profile.subscription_tier = patch.subscription_tier
    if allow_lead_access and patch.lead_access is not None and hasattr(profile, "lead_access"):
        profile.lead_access = patch.lead_access


@router.patch("/broker-profiles/{profile_id}", response_model=BrokerProfileOut)
async def patch_broker_profile(profile_id: UUID, patch: ProfilePatch, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(BrokerProfile).where(BrokerProfile.id == profile_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Broker profile not found")
    _apply_profile_patch(p, patch, allow_lead_access=False)
    await db.commit(); await db.refresh(p)
    return BrokerProfileOut.model_validate(p)


@router.patch("/agency-profiles/{profile_id}", response_model=AgencyProfileOut)
async def patch_agency_profile(profile_id: UUID, patch: ProfilePatch, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(AgencyProfile).where(AgencyProfile.id == profile_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Agency profile not found")
    _apply_profile_patch(p, patch, allow_lead_access=False)
    await db.commit(); await db.refresh(p)
    return AgencyProfileOut.model_validate(p)


@router.patch("/developer-accounts/{profile_id}", response_model=DeveloperAccountOut)
async def patch_developer_account(profile_id: UUID, patch: ProfilePatch, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(DeveloperAccount).where(DeveloperAccount.id == profile_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Developer account not found")
    _apply_profile_patch(p, patch, allow_lead_access=True)
    await db.commit(); await db.refresh(p)
    return DeveloperAccountOut.model_validate(p)


@router.patch("/users/{user_id}/subscription")
async def patch_user_subscription(user_id: UUID, patch: UserSubscriptionPatch, db: AsyncSession = Depends(get_db)):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if patch.account_type is not None:
        u.account_type = patch.account_type
    if patch.subscription_status is not None:
        u.subscription_status = patch.subscription_status
    if patch.is_paid is not None:
        u.is_paid = patch.is_paid
    if patch.subscription_start is not None:
        u.subscription_start = patch.subscription_start
    if patch.subscription_end is not None:
        u.subscription_end = patch.subscription_end
    await db.commit()
    return {
        "id": str(u.id), "account_type": u.account_type,
        "subscription_status": u.subscription_status, "is_paid": u.is_paid,
        "subscription_start": u.subscription_start.isoformat() if u.subscription_start else None,
        "subscription_end": u.subscription_end.isoformat() if u.subscription_end else None,
    }
