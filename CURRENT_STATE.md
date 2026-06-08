# Floxcy — Current State

> **Live status — updated 2026-06-09.** The canonical execution plan is now
> **[docs/FLOXCY-REPLAN-2026.md](docs/FLOXCY-REPLAN-2026.md)** (written from a full read-only diagnostic of CSVs + DB + code). Read it first.
>
> **Done since the 2026-06-02 snapshot below:**
> - **Map UI + OSM building coordinates** (commits `c4390e8`→`864dda5`).
> - **Off-plan coverage research + area-alias artifacts** (`docs/dubai-offplan-market-research.md`, `coverage-gap-note.md`, `area-alias-table.csv`, `dubai-project-master.csv`).
> - **Phase 2 — area marketing↔cadastral name-split FIXED & deployed** (`a06925a`, `6d91d1d`). JVC, Dubai Marina, Dubai Hills, Downtown, Arjan + ~50 more crowded marketing-named areas now show real DLD history (price/rent/yield/bedroom/lifestyle/buildings) by resolving to their cadastral twin while displaying the marketing name. Resolver: `app/data/dld_area_aliases.py::cadastral_data_norm` + `AreaDldBlock.history_name_norm`. Casing-dup dedup confirmed already-done at ingest (`name_norm` unique).
>
> **In progress:** Phase 1 — kill World B (re-point Opportunities + Compare from seeded `market_snapshots` to real DLD across all 284 areas).
>
> **Date-label note (corrected 2026-06-09):** sales/price/appreciation history covers **2009–2026**; rent/yield history covers **2021–2026** (Ejari starts 2021). The CSV filenames `transactions_2021_2026.csv` / `rents_2021_2026.csv` are **misnomers** (transactions actually start 2009) — kept as-is to avoid breaking ETL references.

---

# Floxcy — Build snapshot (2026-06-02 ~07:05 UTC)

Saved at the end of an extended build session. Sections below predate Phase 2 / the replan — treat the status block above + the replan doc as authoritative.

---

## 1. What's complete

### Data pipelines (all idempotent, run via 10.0.1.7 IP swap per CLAUDE.md)

| Pipeline | Source | Output table(s) | Wall time | Row counts |
|---|---|---|---:|---|
| DLD initial layer | current-snapshot CSVs (rents, transactions, brokers, buildings, benchmarks) | `dld_areas`, `dld_area_metrics`, `dld_buildings`, `dld_rera_brokers`, `dld_rent_benchmarks` | — | 362 areas / 294 metrics / 8,075 buildings / 34,396 active brokers / 2,086 benchmarks |
| Price history (Sales-of-Unit 2021–2026) | `transactions_2021_2026.csv` (1.1 GB) | `dld_price_history`, `dld_area_appreciation` | 34 s | 395 (area,year) rows; 71 areas with full 5y series |
| Rent + yield history | `rents_2021_2026.csv` (4.7 GB) | `dld_rent_history`, `dld_yield_history` | 195 s | 1,023 rent rows / 382 yield rows |
| Canonical area registry | All 3 historical CSVs | `dld_canonical_areas` | 4.9 min | 284 unique areas (260 with full 3-source coverage) |
| Land registry | `land_registry.csv` (75 MB) | `dld_land_registry`, `dld_area_land_summary` | 42 s | 259,491 parcels / 260 area summaries / 258 Arabic names filled in canonical |
| Coordinate geocoding | curated + alias bridge + manual overrides + Nominatim | adds 8 coord columns to `dld_canonical_areas` | 10 min | 218/284 with coords (76.8%) |
| Rent alerts table | (empty, populated by user signups) | `rent_alerts` | — | 0 rows live |

### Frontend surfaces shipped

- `/` — homepage with: live ticker, **Market At a Glance** (KPI tiles + picks row driven by `/dld/market-overview`), HomeOpportunities, **HomeFastestGrowing** (top 5y appreciation), featured area, intel cards, top areas table, ROI widget, broker/advisor CTAs.
- `/areas` — universal screener over **284 canonical areas**, type/coverage/sort filters, tier badges, pagination.
- `/areas/[slug]` — full + limited variants. Curated areas show full pages w/ DLD overlay block (median/yield/YoY/sales/rents/buildings/**freehold %/land-use**/Arabic), **Price History 2021–2026 section** with appreciation tiles + chart, **Rent & Yield History section** with trend badge (🟢/🔴/🟡) + compression copy, **Top Buildings** integration, AI insight, undervaluation, charts. DLD-only areas get LimitedAreaPage with honest "Data coming soon" copy + Top Buildings + alias-aware suggestions.
- `/buildings` — 8,075-building index, area filter from canonical, sort by rent_count/PPSF/avg_rent/occupancy, 24-per-page card grid.
- `/buildings/[id]` — full X-Ray: 4-tile income strip (total income / occupancy / implied yield / YoY trend), per-contract economics, footprint, area context with community alias subtitle, comparable buildings, consultation modal (auto-matches buy/English broker scoped to area).
- `/rent-check` — 3-step mobile-first wizard (area dropdown from canonical with rent-count badges, 5 size buckets, rent input). Result panel: verdict tile, percentile bar, 7 enhancement sections (Negotiation Power, RERA Legal Calculator, Rent-vs-Buy, Cheaper Alternatives, Best Time to Negotiate, Rent Alert signup, Share row with deep-link URL).
- `/brokers/directory` — RERA broker directory (34,396 active). 4-step wizard, top companies leaderboard, RERA verification info box, filters, consultation modal, sticky Join CTA.
- `/compare` — 2-4 area comparison, accepts UUIDs + name slugs (canonical), nullable fields render as "Limited data".
- `/opportunities` — curated 70-area opportunity feed w/ link to "Explore all 362 DLD areas →" + honest no-fake-scores note.
- `/advisor` — DLD-grounded LLM context (sample sizes, real YoY, building income aggregates), Redis-cached 1h, free model (`openrouter/free`).
- Admin panel — Coverage section (full/partial/limited/none tier counts + curated/DLD-only split + sample totals + collapsible Data Gaps list).
- i18n infrastructure — en.json + ar.json (Arabic values currently mirror EN — Arabic translations from land_registry now in `dld_canonical_areas.area_name_ar`, 258/284 populated, ready to fill ar.json), middleware locale routing (`/ar/*` → cookie), Noto Sans Arabic font loaded but inactive, RTL CSS helpers, Navbar uses `t(key)` as the template extraction.

### Backend endpoints summary (85 routes total)

- `/areas` (curated): list, /stats, **/all**, **/coverage-stats**, /{slug} (universal resolver: UUID or name_norm)
- `/dld/areas`: list, /stats, /{name_norm}, **/top-appreciation**, **/{name_norm}/price-history**, **/{name_norm}/rent-history**, **/{name_norm}/yield-history**, /{name_norm}/top-buildings
- **`/dld/canonical-areas`** — single source of truth (min_occurrences=5 default)
- **`/dld/market-overview`** — Redis-cached 1h, single-call homepage payload
- `/dld/buildings`, /{id}, /{id}/comparable
- `/dld/brokers`, /{number}, **/broker-match**, **/broker-consultation**
- `/dld/companies/top`, `/dld/rent-check`, `/dld/rent-alerts`
- `/areas/compare`, `/roi/calculate`, `/dashboard/summary`, `/advisor/query`
- Admin/auth/broker-self/consultation/opportunity/insight/methodology/alerts/rankings — unchanged from pre-session

### Operational

- `scripts/verify.sh` — 16 health checks across backend + frontend, ~5s wall time. Flags: `--quick`, `--api-only`, `--frontend-only`, `--help`.
- Coolify deploys: backend `rx3rr9yceika4jqadpcg9e43`, frontend `z1bvg616fblrvs483hqqolyo`.
- BuildKit cache mounts (pip + npm + .next/cache) — second-deploy speedup ~30–50%.

---

## 2. What's in progress

**Geocoding coverage push toward 260+/284 areas.**

Current: **218/284 with coords (76.8%)**. Last commit `3352b7f` added the alias-bridge + manual overrides + loose Nominatim retry.

The user paused before executing the next-tier follow-up: **OSM Overpass API for Dubai admin boundary polygons**. Scope was:
- Query OSM directly for Dubai admin boundary polygons (Overpass API)
- Returns actual polygon shapes (not just centroid points) — also useful for future map / reverse-geocoding features
- Wall time estimate: ~30 min code + ~2 min run
- Expected uplift: ~30 more areas resolved from OSM-curated boundaries

After Overpass, the truly obscure 36ish residue (Al Asbaq, Al Baagh, Al Goze Industrial 1–4, Al Faga'A, Al Lusaily, Al Mararr, etc) would still need either a manual overrides expansion OR be accepted as null.

**Nothing currently running in background.** No active scripts, no pending deploys.

---

## 3. Next pending tasks (in priority order)

| # | Task | Approx effort | Triggered by |
|---|---|---|---|
| 1 | Overpass API geocoding for the 66 still-NULL areas | ~30 min | resume from current session |
| 2 | Expand `data/area_coords_overrides.json` for the residue Overpass can't resolve | ~30 min human lookup | after Overpass |
| 3 | **Process `rents_2021_2026.csv` follow-up question** (was previously deferred — the user moved on instead) | already done | nothing to do |
| 4 | Translate `ar.json` strings (infra is ready, Arabic names already in DB) | depends on translator | when user has Arabic copy |
| 5 | Extract canonical Arabic names back into `data/areas.json` if it drifts | re-run `etl_dld_land_registry.py --to-db` | maintenance |
| 6 | Map UI (frontend) using the coords just collected | ~1 day | when user wants a map |
| 7 | The "advisor opportunity scoring change" was deferred — not in flight | ~30 min when user re-asks | optional |
| 8 | Wire DLD-only areas into `/opportunities` scoring engine | NOT scoped — would require fake scores per house rules; flagged as honest gap | DO NOT do without explicit approval |

---

## 4. Commit log (most recent first)

| Commit | Summary |
|---|---|
| `3352b7f` | Geocoding improvements: alias bridge + Saffa fix + loose retry |
| `c782f66` | Geocode dld_canonical_areas — Phase A curated + Phase B Nominatim |
| `0a1583f` | DLD land registry ETL: parcel data + freehold/land-use overlay + Arabic names |
| `a818414` | Wire canonical areas everywhere — single source of truth |
| `944f6da` | dld_canonical_areas — single source of truth for DLD area names |
| `a25a6dc` | Homepage overhaul + Rent/Yield history + market-overview + yield cap 20% |
| `95d95de` | DLD rent + yield history — ETL, schema, endpoints |
| `62878d6` | Expose 5-year price history + appreciation everywhere |
| `2ff803a` | Deploy speed: BuildKit cache mounts + tighter dockerignores + verify.sh |
| `4b96b20` | DLD price-history ETL — 5y appreciation per area |
| `07122ce` | i18n infrastructure: en/ar dictionaries, /ar prefix routing, RTL hooks |
| `4b1d09c` | Full 362-area coverage across every public surface |
| `4f20110` | /advisor: rewire LLM context to live DLD signals |
| `cee729a` | Taxonomy alias layer: community ↔ admin-sector for Building X-Ray |
| `eb615a1` | Building X-Ray Phase 2+3: pages + integrations |
| `849ff2a` | Building X-Ray Phase 1: 3 new endpoints + enriched buildings list |
| `614cf55` | /rent-check: show all 362 DLD areas with data-availability tiers |
| `4cd98fb` | rent-check: drop model_validator; endpoint check is the source of truth |
| `24ee9c2` | Navbar: 'UAE · v0.1' → 'Dubai · Beta' |
| `dcc14d3` | rent-check: defensive 422 if both size hints are absent |
| `5a14f3a` | Mega: /rent-check 7-feature expansion + /brokers/directory epic rebuild |
| `49899e9` | Backend: rent-check expansion + broker wizard + alerts + middleware fix |
| `9a227bb` | /rent-check: 3-step mobile-first flow + size_category API |
| `4fd0620` | Phase 4: frontend wires up DLD layer |
| `3e9ee37` | Phase 3: extend /areas detail + /areas/compare with DLD overlay |
| `a82affb` | DLD data layer — ETL, models, migration, and API endpoints (the foundation) |

Earlier commits (`dcb312c` and back) predate this session.

---

## 5. DB tables in prod

### DLD-derived (added across this session and prior)

| Table | Purpose | Rows | Migration |
|---|---|---:|---|
| `dld_areas` | DLD area registry from current snapshot | 362 | `c3d4e5f6a7b8` |
| `dld_area_metrics` | per-area 2026-ytd headline metrics | 294 | `c3d4e5f6a7b8` |
| `dld_buildings` | building footprint + Ejari aggregates | 8,075 | `c3d4e5f6a7b8` |
| `dld_rera_brokers` | RERA broker directory | 41,892 total / 34,396 active | `c3d4e5f6a7b8` |
| `dld_rent_benchmarks` | per (area, prop_sub_type, size_band) rent percentiles | 2,086 | `c3d4e5f6a7b8` |
| `dld_price_history` | per (area, year) Sales-of-Unit aggregates (ready / off-plan / blended) | 395 | `e5f6a7b8c9d0` |
| `dld_area_appreciation` | 1y/3y/5y appreciation + 5y CAGR per area | 71 | `e5f6a7b8c9d0` |
| `dld_rent_history` | per (area, year) Ejari rent aggregates with New/Renew split | 1,023 | `f6a7b8c9d0e1` |
| `dld_yield_history` | derived per (area, year) gross yield (rent_psf ÷ sale_ppsf × 100, capped 20%) + YoY delta | 382 | `f6a7b8c9d0e1` |
| `dld_canonical_areas` | **single source of truth** for area names + slugs + Arabic + coords | 284 | `a7b8c9d0e1f2`, `c9d0e1f2a3b4` |
| `dld_land_registry` | parcel-level DLD land records (2026 snapshot) | 259,491 | `b8c9d0e1f2a3` |
| `dld_area_land_summary` | per-area aggregates from land registry (freehold %, land-type mix, top master projects) | 260 | `b8c9d0e1f2a3` |

### App-level tables (unchanged from start of session)

| Table | Purpose |
|---|---|
| `areas` | curated 70 investment-grade areas (with lat/lng for those 70) |
| `market_snapshots` | per-area monthly snapshots (curated time series) |
| `users`, `api_keys`, `audit_logs` | auth + admin |
| `brokers`, `broker_applications` | curated broker supply layer |
| `investor_leads`, `consultations` | demand layer |
| `investment_opportunities` | curated deals |
| `alerts` | per-user alert subscriptions |
| `rent_alerts` | rent-change email subscriptions (from /rent-check) |

### Migration head

Currently: `c9d0e1f2a3b4` (canonical coords). Next will be whatever Overpass needs (likely none — that work writes to existing `dld_canonical_areas` columns).

---

## Local-state reminders for next session

- `.env` swap pattern: `cd backend && cp .env .env.backup && sed -i 's|@mc6ih4pibza2t1ug9uhp3z0i:|@10.0.1.7:|g' .env && <work> && mv .env.backup .env`.
- Deploy triggers (no polling — user runs `./scripts/verify.sh` themselves):
  - Backend: `curl -s -X POST "$COOLIFY_URL/api/v1/deploy?uuid=rx3rr9yceika4jqadpcg9e43" -H "Authorization: Bearer $COOLIFY_API_TOKEN"`
  - Frontend: `curl -s -X POST "$COOLIFY_URL/api/v1/deploy?uuid=z1bvg616fblrvs483hqqolyo" -H "Authorization: Bearer $COOLIFY_API_TOKEN"`
- Source-of-truth JSON files at the repo root: `data/areas.json` (284 canonical, 258 with Arabic), `data/area_coordinates.json` (284 with lat/lng/bbox/source/confidence), `data/area_coords_overrides.json` (7 manual entries — extend this file to add more).
- All large CSVs are in `~/dld-data/`, NOT in the repo. The root `.dockerignore` excludes `dld-data/` defensively.
- Yield display cap: **20%** (see `DISPLAY_YIELD_CAP_PCT` in `schemas/dld.py` and `YIELD_DISPLAY_CAP` in `frontend/src/lib/format.ts`). Values at or above render as **"≥20%"**.

End of state snapshot. See you next session.
