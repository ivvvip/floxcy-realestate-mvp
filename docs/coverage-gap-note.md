# Floxcy Coverage-Gap Note — Dubai Off-Plan

> Internal note reconciling verified market research against Floxcy's actual DLD dataset (`~/dld-data/`, snapshot 2026-06-01).
> Purpose: let an investor verify that Floxcy covers the whole Dubai off-plan universe — and show the two fixes that close the gaps.

---

## Bottom line

Floxcy's underlying data **already covers the whole Dubai off-plan universe**, but two presentation/assembly fixes are required before the "we cover everything" claim is defensible under scrutiny.

## The scorecard

| Dimension | Market (verified) | Floxcy data | Status |
|---|---|---|---|
| Off-plan share of transactions | 62–72% (residential) | **52.7% off-plan / 47.3% ready** (all property types) | ✅ Same reality, wider denominator |
| Distinct off-plan projects | ~1,300+ active | **1,396 off-plan/mixed** in master | ✅ Covered |
| Total distinct projects | — | **2,913** (off-plan + ready) | ✅ |
| Major developers | ~18 named | All present; **172 distinct** developers in feed, 133 RERA entities | ✅ |
| Communities / areas | ~15 named | **262 distinct areas** — all named areas present | ✅ (under DLD names) |
| Escrow / Oqood spine | DLD Law No. 8/2007 | Escrow account # on 190/255 launch records | ✅ On the authoritative source |

## Gap 1 — Project master was under-built (FIXED)

- The raw `projects-2026-06-01.csv` feed is a **"new launches" feed**: only **255 projects**, all <21% built. An investor cross-checking a well-known under-construction tower would likely **not** find it.
- The real universe is provable from Floxcy's **own transaction history**: **1,300 distinct off-plan projects** transacted, so ~1,163 were absent from the launch feed.
- **Fix applied:** built `dubai-project-master.csv` = union of projects feed + transaction `PROJECT_EN`/`MASTER_PROJECT_EN`.
  - **2,913 distinct projects** (1,396 off-plan/mixed, 1,517 ready).
  - 96 launch-feed-only (too new for transactions), 2,658 transactions-only, 159 in both.
  - Each row enriched with developer, off-plan/ready transaction counts, total value, top area, master project, escrow flag.
- **Action:** make this union table the project master in the app; keep the 255-feed as a "newest launches" view, not the universe.

## Gap 2 — Area names are cadastral, not marketing (FIXED)

Every research-named community IS in the data, but under DLD's **official cadastral names**. A user typing a marketing name finds nothing and wrongly assumes a gap:

| Marketing name (what users search) | DLD area name (what data stores) | Txns |
|---|---|---|
| Downtown | Burj Khalifa | 1,525 |
| Expo City | Madinat Al Mataar | 4,912 |
| Dubailand | Dubai Land Residence Complex / Majan | 3,545 / 3,318 |
| Maritime City | Madinat Dubai Almelaheyah | 738+ |
| Dubai Marina | Marsa Dubai (cadastral) | — |

- **Fix applied:** built `area-alias-table.csv` — **101 aliases** (83 high-confidence, 18 medium master-district spans), every target validated against the live area list (0 dangling). See `area-alias-README.md` for app integration.
- **Bonus finding:** 5 areas are stored under two casings, silently splitting transactions (`BUSINESS BAY` 4128 vs `Business Bay` 378, etc.). Documented with a normalization rule in the README.
- **Action:** wire the alias table into search/filter; uppercase-trim `AREA_EN` as the join key on ingest.

## What no longer needs doing

- No new data source required — DLD/Oqood (the verified authoritative spine) is already integrated.
- Developer coverage is complete; do not chase blog league tables (several were refuted 0-3 in research).

## Artifacts

- `docs/dubai-offplan-market-research.md` — verified market report with sources.
- `docs/dubai-project-master.csv` — the 2,913-project union master.
- `docs/coverage-gap-note.md` — this note.

## Next steps

1. Wire `dubai-project-master.csv` into the app as the project master.
2. Build the marketing→cadastral area alias table.
3. Re-run this reconciliation on each fresh DLD snapshot to keep the coverage claim current.
