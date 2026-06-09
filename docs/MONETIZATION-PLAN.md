# Floxcy — Monetization Plan

> **Status: FOUNDATION BUILT, NOT ACTIVATED (2026-06-09).**
> The data model, account types, admin controls and claim flow are live. **No
> payment processing is wired and no features are gated.** Tiers/verification/
> featured flags are set **manually by an admin** until Stripe is activated.
> Scope guard: Floxcy only (`~/floxcy-realestate-mvp/`).

---

## 1. Account types & pricing

Account type lives on `users.account_type` (string; see
`app/core/account_types.py`). `users.role` stays the permission axis
(admin/analyst/viewer); `account_type` is the monetization axis.

| account_type | Who | Indicative price* | What it unlocks (when gating is activated) |
|---|---|---|---|
| `free` | Default investor | AED 0 | Browse all DLD data, areas, buildings, off-plan, rent-check, advisor (rate-limited) |
| `investor_premium` | Serious investor | ~AED 49/mo | Unlimited advisor queries, saved searches/alerts, full comparison & ROI exports, early opportunity access |
| `broker_basic` | Individual RERA broker | AED 0 (claimed, free) | Claimed verified profile, receive routed leads, basic stats |
| `broker_premium` | Individual RERA broker | ~AED 199/mo | Featured placement in directory/wizard, priority lead routing, lead CRM, performance analytics |
| `agency` | Brokerage / agency | ~AED 499–999/mo | Agency page, all linked brokers, featured agency placement, team lead routing, branding |
| `developer_basic` | Developer | AED 0 (claimed, free) | Claimed verified developer, populate TIER 2 enrichment (payment plans, prices, images) on own projects |
| `developer_pro` | Developer | ~AED 999–2,500/mo | `lead_access` (see investor leads on their projects), featured projects, project analytics, priority placement |

\* Prices are **placeholders for planning** — finalize against Bayut/Property
Finder/local benchmarks before activation. Nothing here is charged today.

### Pricing rationale
- **Brokers/developers claim for free** to maximize claimed-profile coverage
  (supply density), then upsell featured/lead-access — the classic directory
  flywheel. A claimed profile is worth more to us (verified data) than a wall.
- **Lead-gen is the defensible revenue** (Phase 4 of the replan): we already
  have 34,396 RERA brokers + 255 official projects + real investor leads. Charge
  for *qualified routed leads* (premium/pro) and *featured placement*.
- **Investor_premium** monetizes the demand side lightly — most investor value
  stays free to keep traffic/SEO; premium is for power users (alerts, exports,
  unlimited advisor).
- **Agency** is the highest tier because it bundles many brokers + branding +
  team routing.

---

## 2. Data model (shipped)

### Account types — `users` (PART 1)
`account_type`, `subscription_status` (active/inactive/trial),
`subscription_start`, `subscription_end`, `is_paid` (default false).

### Claimable profiles (PART 2–4)
| Table | Keyed on | Notes |
|---|---|---|
| `broker_profiles` | `broker_number` → `dld_rera_brokers` | photo/bio/specialties/languages/areas, `is_verified`, `is_featured` (paid), `subscription_tier`, `claimed_at` |
| `agency_profiles` | `real_estate_number` (RERA) | `agency_name`, `broker_numbers[]`, `is_verified`, `is_featured`, `subscription_tier` |
| `developer_accounts` | `developer_number` → `dld_developers` | `claimed_projects[]`, `is_verified`, `lead_access`, `subscription_tier`; owners populate `project_enrichment` (TIER 2) |

### Claim intake (PART 7)
`account_claims` — `claim_type` (broker/agency/developer), `target_id`,
claimant contact, `status` (pending/approved/rejected), `reviewed_by`,
`reviewed_at`, `review_note`.

### Lead routing (PART 5) — `investor_leads`
Added `lead_type` (broker/developer/agency), `lead_status`
(new/sent/contacted/closed), and FKs: `assigned_broker_number` →
`dld_rera_brokers`, `assigned_developer_number` → `dld_developers`,
`assigned_agency_id` → `agency_profiles`. The legacy `status` field is retained
for the existing `/admin/leads` view; `lead_status` is the new routing axis.

Migration: `f3a4b5c6d7e8_monetization_foundation` (auto-applied on deploy via
`entrypoint.sh`).

---

## 3. Admin controls (shipped) — PART 6

All admin-gated (`require_admin`), reachable from the `/admin` dashboard nav.

| Page | Endpoint(s) | Does |
|---|---|---|
| `/admin/accounts` | `GET /api/v1/admin/accounts`, `PATCH /api/v1/admin/{broker-profiles,agency-profiles,developer-accounts}/{id}` | View all claimed profiles by type; toggle verified / featured / lead_access; set subscription_tier |
| `/admin/subscriptions` | `GET /api/v1/admin/subscriptions` | Status overview across users + profiles; counts (paid/active/trial) |
| `/admin/claims` | `GET /api/v1/admin/claims`, `POST …/{id}/approve`, `…/{id}/reject` | Review pending verifications; approve → creates/links the profile (verified) |
| (existing) `/admin/leads` | `GET /api/v1/admin/leads` | Now also exposes lead routing fields |
| `PATCH /api/v1/admin/users/{id}/subscription` | — | Manually set a user's account_type / status / is_paid / dates |

---

## 4. Claim flow (shipped, no payment) — PART 7

1. User clicks **"Claim this profile"** — on `/developers/[number]`
   (`ClaimProfileButton`) and on broker cards in `/brokers/directory`.
2. Modal collects name + contact + optional company/message → `POST /api/v1/claims`
   → row in `account_claims` (status `pending`).
3. Admin reviews in `/admin/claims` → **Approve** creates/links the matching
   profile, marks `is_verified=true`, sets `claimed_at`, and flips the claim to
   `approved`.
4. Profile is now an admin-managed account (editable surface + future owner
   editing).
5. **Payment gate comes later** (Stripe) — see activation checklist.

---

## 5. Activation checklist (for when ready)

**Payments**
- [ ] Add Stripe (products/prices per tier above; reference Loxcya's Phase-11
      Stripe pattern for *approach only* — do **not** share keys/code/UUIDs across projects).
- [ ] `POST /api/v1/billing/checkout` (create session) + customer portal link.
- [ ] Stripe webhook → set `users.is_paid`, `subscription_status`,
      `subscription_start/end`, and the profile `subscription_tier`/`is_featured`/`lead_access`.
- [ ] Store `stripe_customer_id` / `stripe_subscription_id` (add columns).

**Feature gating (currently OFF)**
- [ ] Advisor rate-limit by `account_type` (free vs investor_premium).
- [ ] Directory/wizard ranking boost for `is_featured` brokers/agencies.
- [ ] Lead routing: only deliver to `developer_accounts.lead_access=true` /
      `broker_premium`.
- [ ] Gate TIER 2 enrichment editing to the owning `developer_account`.
- [ ] Exports/alerts gated to `investor_premium`.

**Accounts/auth**
- [ ] Public signup + login for broker/agency/developer owners (today the claim
      flow is contact-based; owner self-editing needs auth + `user_id` linkage).
- [ ] On claim approval, optionally provision a `user` with the right
      `account_type` and email an invite.

**Ops**
- [ ] Lead-assignment UI (set `assigned_*` + `lead_status`) and notifications.
- [ ] Pricing finalized vs market; trial logic (`subscription_status='trial'`).
- [ ] Terms/refund/VAT (UAE 5%) copy.

---

## 6. What is intentionally NOT done yet
- ❌ No Stripe / payment processing.
- ❌ No feature gating — everything stays free and open.
- ❌ No public owner login/self-editing (claim is contact-based; admin manages).
- ❌ No automated lead routing — FKs/fields exist; assignment is manual.

This document is the contract for "what activation means." Build the checklist
above when the business is ready to charge.
