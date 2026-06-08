# Floxcy Replan 2026 — Prioritized Execution Plan

> **Status:** Plan only. Nothing implemented yet.
> **Authored:** 2026-06-08, from the deep read-only diagnostic of CSVs (`~/dld-data/`), the live Floxcy DB (container `mc6ih4pibza2t1ug9uhp3z0i`, postgres:18), and the backend/frontend code.
> **Scope guard:** Floxcy only (`~/floxcy-realestate-mvp/` + `~/dld-data/`). Do **not** touch Loxcya, its Coolify project, or its Postgres (`ktiymo2t7aroo4vdy9dv695r`).

---

## The framing finding

Floxcy runs on **two disconnected data worlds**:

- **World A (real):** the DLD pipeline → `dld_*` tables, ~284 cadastral areas, genuinely rich. Powers `/areas`, `/dld/*`, the **AI Advisor**, and Compare's overlay block.
- **World B (legacy/seeded):** `areas` (70 rows) + `market_snapshots` (**mostly synthetic seeded** rows) → powers **Opportunities**, **ROI**, and Compare's core metric table.

Almost everything that looks "fake or broken" to an investor is World B leaking through, plus a **marketing-vs-cadastral area name split** that strands the busiest areas on empty pages. This replan systematically retires World B, repairs the name split, fills the off-plan gap, and turns the broker asset into revenue.

**Reference standard:** the **AI Advisor** is already built correctly (real LLM + real DLD context + citations). Use it as the template for what every other surface should look like. **Do not modify it.**

---

## Verified ground-truth snapshot (the evidence this plan rests on)

### CSV → DB landing
| CSV | Rows | → DB outcome |
|---|---|---|
| transactions_2021_2026.csv | **1,718,613** (full history ~2009–2025; the "2021_2026" name is wrong) | aggregated only → `dld_price_history`(887), `dld_yield_history`(371), `dld_bedroom_benchmarks`(4,419), `dld_buildings_sales`(4,641), `dld_gift_transfers`(2,055), `dld_area_appreciation`(73). Raw rows not retained (by design). |
| rents_2021_2026.csv | **10,088,673** (full history) | aggregated → `dld_rent_history`(978), `dld_rent_benchmarks`(1,254), `dld_building_rent_history`(6,875), `dld_lease_expiry_forecast`(37,215), `dld_commercial_benchmarks`(2,485). Raw not retained. |
| brokers-2026-06-01.csv | 41,899 | `dld_rera_brokers` (41,892) — 99.98% ✅ |
| buildings-2026-06-01.csv | 8,075 | `dld_buildings` (9,294, backfilled +1,219 from txns) ✅ |
| **projects-2026-06-01.csv** | **457** | **NOT INGESTED** — no `dld_projects` table ❌ |
| **developers-2026-06-01.csv** | **133** | **NOT INGESTED** — developer guessed heuristically ❌ |

### Area coverage
- Distinct areas in DLD transactions: **258** · `dld_areas` registry: **362** · `dld_canonical_areas`: **284**
- **Full data (price+rent+yield): only 68 areas.** price=73, rent=171, yield=68, appreciation=73, bedroom=69, population=126, lifestyle=277.
- **262 areas transact; ~194 lack the full triad** — much of it the name split below.

### The name split (same area stored twice)
| Marketing row (gets 2026 traffic) | txns | data | Cadastral twin | data |
|---|---|---|---|---|
| Jumeirah Village Circle | 6,198 | empty | Al Barsha South Fourth | full |
| Dubai Marina | 1,854 | empty | Marsa Dubai | full |
| Dubai Hills | 1,033 | empty | Hadaeq Sheikh Mohammed Bin Rashid | full |

### Opportunities data source (the trust risk)
`market_snapshots` = **840 rows tagged `data_source = "Aggregated public sources Q1 2026"` (seeded/synthetic)** + 24 rows tagged `DLD 2026 YTD` whose `appreciation_1y`, `appreciation_3y`, `occupancy_rate`, `demand_score`, `risk_score`, `investment_score` are **all NULL** → the engine substitutes hardcoded fallbacks (appreciation=0, risk=5.0, occupancy=0.85). ~45% of the score weight is synthetic or constant.

---

## PHASE 1 — Kill World B (highest trust risk)

**Problem:** Opportunities and Compare's core metrics read seeded `market_snapshots` (840 synthetic rows). Investors cannot trust the scores; the numbers don't trace to any verifiable DLD source.

**Action:**
- Re-point `app/services/opportunity_engine.py` from `market_snapshots` → **`dld_area_metrics` + `dld_area_appreciation` + `dld_yield_history`** (all real, already computed).
- **Keep the scoring formula** — `100 × (0.30·yield + 0.25·appreciation + 0.25·value + 0.10·demand + 0.10·risk)` at `opportunity_engine.py:155` is sound. **Only the data source changes.**
- Map the inputs to real columns:
  - `rental_yield` → `dld_yield_history.gross_yield_pct` (latest year) or `dld_area_metrics.rental_yield_pct`
  - `appreciation_1y` → `dld_area_appreciation.appreciation_1y_pct` (no more fallback-to-0)
  - `price_per_sqft` / cohort median → `dld_area_metrics.median_price_per_sqft`
  - `transaction_volume` → `dld_areas.txn_count` / `dld_area_metrics.sales_count`
  - `risk` / `demand` → derive from real DLD signals (volatility of price history, sample volume) instead of NULL→constant. Document the derivation in `/methodology`.
- Do the same for **Compare's core metrics table** (`app/api/routes/compare.py` "curated snapshot metrics" block) — drive it from `dld_*`, not `market_snapshots`.
- **Deprecate then delete `market_snapshots`** (864 rows) and the legacy **`areas` (70)** table once nothing references them. Sequence: (1) migrate consumers, (2) verify no code path reads them, (3) drop in a migration.

**Consumers to migrate before dropping `areas`/`market_snapshots`** (audit required — at least): `opportunity_engine.py`, `deal_scoring.py`, `compare.py`, `dashboard.py`, `roi` (see decision #2), `seed_market_snapshots.py`, `seed_areas.py`.

**Result:** every number on Opportunities and Compare traces to real DLD data. The seeded world is gone.

**Risk / guardrail:** Opportunities currently also merges broker `investment_opportunities` deals (0 rows today) — preserve that path. Re-run `scripts/verify.sh` after the cutover.

---

## PHASE 2 — Fix the area name-split (biggest UX win) — ✅ DONE (2026-06-09)

> **Shipped & deployed** (commits `a06925a`, `6d91d1d`). Implemented as a
> **resolver layer** (display marketing name, query cadastral twin) rather than
> a destructive registry row-merge — lower risk, same outcome.
> - `app/data/dld_area_aliases.py::cadastral_data_norm` + `MARKETING_TO_CADASTRAL_PRIMARY`
>   (54 entries, each DB-validated to hold history; cross-checked via `dld_buildings`).
> - `AreaDldBlock.history_name_norm` drives all frontend history/bedroom/lifestyle/
>   buildings fetches; `get_area` sets it in both DLD-block branches + a fallback
>   for curated areas with no linked DLD row (Downtown, Dubai Hills Estate, Damac Hills 2)
>   + curated-Area name-slug resolution so `/areas/<marketing-slug>` resolves.
> - **Result:** top 10 crowded areas went **0/0/0 → full** price/rent/yield (JVC 18/6/6,
>   Marina 18/6/6, Dubai Hills 13/6/6, Downtown 18/6/6, …). Controls unchanged → zero regression.
> - **STEP 2 (casing dups):** already handled at ingest (`name_norm` unique; Business Bay
>   4128+378 merged to 4506) — verified, no action.
> - **STEP 4/5 note:** the empty-data symptom existed only on the area detail page;
>   compare/rent-check/map read 2026 metrics that exist on marketing rows or use
>   AreaSelector synonyms. Slugs forward-only (nothing renamed).

**Problem:** JVC, Dubai Marina, Dubai Hills (and ~12 more crowded areas) render **empty** because the marketing name in the registry ≠ the cadastral name the data is keyed on. The data fully exists under the cadastral twin.

**Action:**
- Use **`docs/area-alias-table.csv`** (already built, 101 aliases, 0 dangling targets) as the mapping source of truth.
- **Merge registry rows — do not just patch search.** The fix must make the area page itself resolve:
  - JVC → pull `Al Barsha South Fourth` data
  - Dubai Marina → pull `Marsa Dubai` data
  - Dubai Hills → pull `Hadaeq Sheikh Mohammed Bin Rashid` data
- Pattern: **display the marketing name, query the cadastral name.** Add a canonical resolver layer (marketing alias → cadastral `name_norm`) used by every area-scoped endpoint, so one alias table fixes all surfaces (area page, compare, opportunities, search).
- Fix the **5 casing duplicates** that silently split transactions (e.g. `BUSINESS BAY` 4,128 vs `Business Bay` 378) by uppercase-trimming `AREA_EN` as the join key on ingest.
- Decide the registry shape: either collapse duplicate rows into one canonical row with alias metadata, or keep the marketing row as a thin pointer to the cadastral row. (Recommendation: single canonical row + `aliases[]`.)

**Result:** the top ~15 crowded areas flip from empty → fully populated (price, rent, yield, bedroom breakdown, population, lifestyle) instantly, with near-zero new data. Transaction counts stop being split.

**Guardrail:** forward-only on slugs — existing public URLs/audit logs must keep working; add redirects from marketing slugs to canonical, don't break them.

---

## PHASE 3 — Ingest projects + developers

**Problem:** `projects-2026-06-01.csv` (457) and `developers-2026-06-01.csv` (133) are completely unused. Off-plan is inferred from transaction history (off-plan vs ready ppsf) and the developer is a heuristic guess.

**Action:**
- Create **`dld_projects`** table from projects CSV. Keep: `PROJECT_NUMBER`, `PROJECT_EN`, `DEVELOPER_NUMBER`, `DEVELOPER_EN`, `PRJ_TYPE_EN`, `PROJECT_VALUE`, `ESCROW_ACCOUNT_NUMBER`, `PROJECT_STATUS`, `PERCENT_COMPLETED`, `START_DATE`, `END_DATE`, `COMPLETION_DATE`, `INSPECTION_DATE`, `CNT_LAND/BUILDING/VILLA/UNIT`, `AREA_EN`, `ZONE_EN`, `MASTER_PROJECT_EN`, `DESCRIPTION_EN`.
- Create **`dld_developers`** table from developers CSV (`DEVELOPER_NUMBER`, `DEVELOPER_EN`, license fields, legal status, webpage/phone).
- Write ETL for both (extend `scripts/etl_dld.py` or add `etl_dld_projects.py`). Join key to existing data: `PROJECT_NUMBER` (also present in `dld_buildings.project_number` and transactions) + `AREA_EN` (run through the Phase-2 canonical resolver).
- Wire into `/offplan` and `/developers`:
  - Real **% completion** (`PERCENT_COMPLETED`) + progress bar
  - **Escrow account** present/absent → trust badge
  - **Handover date** (`COMPLETION_DATE`) instead of inferred-from-last-txn
  - **Verified developer** (direct `DEVELOPER_EN`) instead of brand-guess in `developers.py`
  - **Unit counts** (`CNT_UNIT`/`CNT_VILLA`) instead of txn-count proxy
- Keep the existing transaction-derived off-plan-vs-ready price comparison — it's good; layer the registry data on top.

**Result:** registry-grade off-plan pages backed by official DLD fields.

**Documented limits (future, need 3rd-party sources — Bayut/Property Finder/developer sites):** payment plans, floor plans/unit layouts, amenities, renders. These are **not** in any DLD feed. Do not promise them from DLD alone.

---

## PHASE 4 — Monetize brokers

**Problem:** 41,892 brokers and ~12,955 distinct agencies, full RERA directory + matching wizard + lead capture — but **zero revenue**. Lead routing is a fragile `message`-field string prefix (`[source=broker_directory broker=… firm=…]`).

**Action:**
- Add a **proper broker↔agency schema relation** (FK from broker to an `agencies` table keyed on `real_estate_number`) instead of carrying `real_estate_name` as a loose string.
- Add a **proper lead→broker relation** (FK on `investor_leads`, not a string prefix in `message`).
- Add monetization hooks:
  - **Featured broker placement** (paid ranking boost in the wizard/directory)
  - **Lead-gen fees** (charge per routed/qualified lead)
  - **Broker SaaS tier** (dashboard, CRM, lead tracking)
- **Stripe integration** for the above. (Note: Loxcya already has a working Stripe Phase-11 implementation as a reference pattern — read for approach only, **do not share code/keys/UUIDs across projects**.)

**Result:** the only feature with a real, defensible business model starts earning.

---

## LEAVE ALONE — AI Advisor

Real OpenRouter LLM call (`app/api/routes/advisor.py:271`), injects a real DLD market table built from `dld_area_metrics` + `dld_area_appreciation` + `dld_price_history`, system prompt forbids inventing numbers and mandates DLD citations, Redis-cached, model fallback chain, deterministic rules-based fallback so it's never empty.

**It is the reference standard. Do not modify. Use its pattern (real data → cited output) for everything in Phases 1–3.**

---

## Decisions needed from user (before implementation)

1. **Compare** — fix (re-point core metrics to DLD, keep simulator + verdict panel) **[recommended]**, or delete the feature?
2. **ROI calculator** — fix its data source to DLD (it currently leans on World B), or keep as-is for now?
3. **Monetization priority** — Phase 4 brokers first, or Phase 3 developers/off-plan first? (They can also run in parallel if scoped to different files.)

---

## Suggested execution order

`Phase 1 → Phase 2 → Phase 3 → Phase 4`, with **Phase 1 and Phase 2 highest priority** (trust + UX). Phase 2 may even precede Phase 1 since it's lower-risk and high-visibility — confirm with user. Each phase: one logical change set, re-run `scripts/verify.sh`, verify Floxcy isolation (no Loxcya touch), then stop and report before the next.

## Out of scope / future backlog
- Payment plans, floor plans, amenities (need 3rd-party data).
- Individual-transaction drill-down (raw txn/rent rows are aggregated on ingest, not stored).
- Re-running the coverage reconciliation on each fresh DLD snapshot to keep the "we cover everything" claim current.
