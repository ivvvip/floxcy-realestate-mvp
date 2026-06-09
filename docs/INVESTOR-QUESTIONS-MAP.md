# Floxcy — Investor Questions Map

> Reference doc mapping **every question a Dubai property investor asks** to what
> Floxcy can answer today, with the gaps ranked by demand. Built from market
> research + the current product surface (2026-06-09). **Planning artifact — no
> code.** Decide what to build from the priority list at the bottom.
>
> Legend: ✅ shipped · ⚠️ gap (not yet built) · 🔶 partial

---

## Category 1 — "Should I buy now?" (Timing)

**Questions investors ask**
- Is 2026 a good time to buy?
- Should I wait for prices to drop?
- What phase of the cycle are we in?
- When is the best month to buy?
- Is the market overheated?

**Floxcy answers**
- ✅ **/timing** — city-level, statistically verified: buy **February** (~7% below avg), sell **Nov–Dec**; "no summer slowdown" myth-buster.
- ✅ **18-year price history** (2009→2026) for cycle context per area.
- ✅ **AI Advisor** — discusses market phase with real DLD signals.
- ⚠️ **GAP: market-cycle-phase indicator** — a single "where are we in the cycle now?" read (expansion / peak / correction / recovery) from price momentum + volume + yield compression. We have all the inputs; no synthesized indicator yet.

---

## Category 2 — "Where should I buy?" (Area)

**Questions**
- Which area has the highest ROI?
- Best area for my budget?
- JVC vs Business Bay vs Marina?
- Highest rental-yield areas? Best capital-appreciation areas?
- Affordable areas with good returns?

**Floxcy answers**
- ✅ **/areas** — 284 canonical areas with gated DLD yields + coverage tiers.
- ✅ **/compare** — 2–4 areas side by side.
- ✅ **/opportunities** — scored, real-DLD opportunity feed.
- ✅ **/map** — visual yield heatmap (139 area polygons).
- ✅ **AI Advisor** — budget/goal/risk → ranked area recommendations with rationale.

**Verdict: strongest category — well covered.**

---

## Category 3 — "What will I earn?" (ROI / Yield)

**Questions**
- What ROI can I expect?
- Gross vs **net** yield?
- What are the service charges?
- Short-term (Airbnb) vs long-term rental?
- Cash-on-cash return with a mortgage?

**Floxcy answers**
- ✅ **/roi-calculator** — basic ROI.
- ✅ **Gross yield** per area (DLD rent ÷ sale PPSF, gated).
- ⚠️ **GAP: NET yield** — research's #1 complaint about gross. Net = gross − service charge − maintenance − vacancy. **Highest-demand gap.**
- ⚠️ **GAP: service-charge data** — not in our DLD CSVs (lives in RERA **Mollak**). Workaround: editable estimate (AED/sqft) with honest "adjust to your building" labeling.
- ⚠️ **GAP: short-term (Airbnb) vs long-term** yield comparison.
- ⚠️ **GAP: cash-on-cash with mortgage** (LTV, rate, down-payment → levered return).

---

## Category 4 — "Is it safe?" (Risk / Legal)

**Questions**
- Is off-plan safe? Is the developer reliable?
- Escrow account verified? RERA registered?
- Can foreigners buy? Freehold vs leasehold?

**Floxcy answers**
- ✅ **/offplan** — official DLD **escrow badges** + verified developer + % completion.
- ✅ **/developers** — project count, portfolio value, active/pending pipeline, license status.
- ✅ **Freehold %** + land-use per area (land registry).
- ✅ **RERA broker verification** (34,396 active brokers).
- ⚠️ **GAP: developer reliability score** — could synthesize from on-time delivery history, escrow presence, completion track record into a single grade.

---

## Category 5 — "What does it cost?" (Fees)

**Questions**
- DLD fees (4%)? Total closing costs? Hidden fees?
- Do I need 7–8% above the price?

**Floxcy answers**
- 🔶 **/roi-calculator** includes DLD 4% / agency 2% / trustee in its math.
- ⚠️ **GAP: standalone total-cost calculator** with a clear **"budget 7–8% above price"** headline + itemized closing-cost breakdown (the buffer message isn't surfaced prominently).

---

## Category 6 — "Visa / Residency"

**Questions**
- Property for Golden Visa? AED 750K visa eligibility? AED 2M Golden Visa? Sponsor family?

**Floxcy answers**
- ⚠️ **GAP: visa-eligibility indicator** — research shows this is a **huge** investor concern, and we have **nothing**.
  - Indicative thresholds (rules-based, no missing data): **AED 750K → ~2-year investor visa**; **AED 2M → 10-year Golden Visa** (mortgaged property now qualifies).
  - Could ship as: an **eligibility checker** (budget → visa tier + conditions) **and** an automatic **"✅ Golden Visa eligible"** badge on any property/area at/above the threshold.
  - Mandatory caveat: "Indicative — verify with GDRFA/ICP; rules change." (Matches our honesty pattern.)

---

## Category 7 — "Off-plan vs Ready"

**Questions**
- Off-plan or ready? Is off-plan worth the wait? Payment plans? Capital appreciation off-plan?

**Floxcy answers**
- ✅ **/offplan** — off-plan-vs-ready price context + status + completion %.
- ⚠️ **GAP: payment plans** — the **TIER 2 `project_enrichment`** table exists but is empty; the UI already supports it. Needs population (developer sites / portals) — not in any DLD feed.

---

## Category 8 — "Mistakes to avoid"

**Common investor mistakes (research)**
- Using gross yield instead of net · ignoring service charges · unlicensed brokers · no escrow verification · underestimating costs · no clear strategy.

**Floxcy could address via**
- ⚠️ **GAP: "Investor checklist / avoid these"** educational content — ties directly to the net-yield, escrow, and broker-verification features we already have.

---

## Priority gaps to add (ranked by demand)

| # | Gap | Tier | Effort | Data we have | Missing piece |
|---|---|:--:|:--:|---|---|
| 1 | **NET yield** (not just gross) | 🔴 HIGH | Med | rent, price | service-charge estimate (editable) |
| 2 | **Golden Visa eligibility** badges + checker | 🔴 HIGH | **Low** | prices everywhere | none — pure rules |
| 3 | **Market-cycle-phase** indicator | 🔴 HIGH | Med | 18y price + volume + yield | a synthesized phase model |
| 4 | Short-term vs long-term yield | 🟡 MED | Med | long-term rent | STR/Airbnb benchmark source |
| 5 | Cash-on-cash with mortgage | 🟡 MED | Low | price/rent | mortgage inputs (UI only) |
| 6 | Service-charge data (RERA Mollak) | 🟡 MED | High | — | external Mollak ingest |
| 7 | Developer reliability score | 🟡 MED | Med | projects, escrow, completion | scoring model |
| 8 | Investor checklist / education | 🟢 NICE | Low | — | content |
| 9 | Total-cost calculator (clearer 7–8%) | 🟢 NICE | Low | fee math exists | UI surface |

### Recommended sequence
1. **Golden Visa** (🔴, lowest effort, no missing data, huge concern) — quick high-impact win that plugs into /offplan + /areas + /roi.
2. **NET yield** (🔴, the #1 ROI complaint) — upgrade /roi-calculator with editable service-charge/vacancy/management inputs → net yield + cash-on-cash + payback.
3. **Market-cycle-phase indicator** (🔴) — extend /timing or the homepage with a synthesized "where are we now" read.

Then 🟡 items as demand confirms. **Decide build order from this list.**
