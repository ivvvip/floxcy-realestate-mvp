# Area Alias Table — usage

`area-alias-table.csv` maps **marketing community names** (what users and investors type) to **DLD cadastral area names** (what `AREA_EN` actually stores). Without it, searching "Downtown" or "Expo City" returns zero results even though the data is fully present.

## Columns

| Column | Meaning |
|---|---|
| `marketing_name` | What a user types (e.g. "Downtown", "JLT", "Maritime City") |
| `dld_area_en` | One or more real `AREA_EN` values, `\|`-separated |
| `confidence` | `high` = direct/verified mapping; `medium` = master-district spanning several cadastral areas, review before relying |
| `note` | Why the mapping exists (e.g. "Marsa Dubai is Marina's official cadastral name") |
| `unmatched_targets_review` | Targets not found in current data (currently empty — all validated) |

## How to use in the app

1. **Search/filter resolution:** when a user picks/types a `marketing_name`, expand the query to `WHERE AREA_EN IN (dld_area_en split on '|')`.
2. **Display:** show the friendly `marketing_name` in the UI; query on the cadastral values underneath.
3. **One-to-many is expected:** master districts (Dubailand, MBR City, Dubai South) legitimately map to several cadastral areas — that's why a single marketing name can carry multiple `dld_area_en`.

## Stats

- **101 aliases** — 83 high-confidence, 18 medium (master-district spans, flagged for review).
- All 101 validated: every `dld_area_en` exists in the live transaction data.

## ALSO FIX: 5 casing-duplicate areas (data normalization)

The DLD export stores some areas under two casings, silently splitting their transactions. Normalize `AREA_EN` to a canonical casing on ingest:

| Variants (count) | Canonical |
|---|---|
| `BUSINESS BAY` (4128) / `Business Bay` (378) | BUSINESS BAY |
| `Dubai Investment Park First` (633) / `DUBAI INVESTMENT PARK FIRST` (391) | DUBAI INVESTMENT PARK FIRST |
| `Dubai Investment Park Second` (889) / `DUBAI INVESTMENT PARK SECOND` (216) | DUBAI INVESTMENT PARK SECOND |
| `Palm Deira` (2438) / `PALM DEIRA` (382) | PALM DEIRA |
| `PALM JUMEIRAH` (898) / `Palm Jumeirah` (20) | PALM JUMEIRAH |

Recommended ingest rule: uppercase-trim `AREA_EN` as the join key, keep a display-casing lookup. This collapses the 267 raw areas to ~262 true areas.
