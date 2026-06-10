export function formatAED(value: number, opts?: { compact?: boolean }) {
  if (!Number.isFinite(value)) return '—';
  if (opts?.compact) return formatLargeAED(value);
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Smart magnitude formatter for AED values. Picks K / M / B / T based on
 * the size so 1.14 trillion renders as "AED 1.14T" instead of the old
 * compact path's "AED 1140358.19M".
 *
 *   12  → "AED 12"
 *   850 → "AED 850"
 *   1_200 → "AED 1.2K"
 *   21_000_000 → "AED 21M"
 *   131_000_000_000 → "AED 131B"
 *   1_140_358_190_000 → "AED 1.14T"
 *
 * Pair with `formatAEDFull` for a `title=` tooltip so users can hover to
 * see the unabbreviated number.
 */
export function formatLargeAED(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  // Strip trailing zeros so 131.00B → 131B and 1.20T → 1.2T. Keeps signal
  // density high without sacrificing precision when it matters
  // (e.g. 1.14T stays at 1.14T, not 1T).
  const trim = (n: number, digits: number) =>
    n.toFixed(digits).replace(/\.?0+$/, '');
  if (abs >= 1_000_000_000_000) return `AED ${trim(value / 1_000_000_000_000, 2)}T`;
  if (abs >= 1_000_000_000) return `AED ${trim(value / 1_000_000_000, 2)}B`;
  if (abs >= 1_000_000) return `AED ${trim(value / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `AED ${trim(value / 1_000, 1)}K`;
  return `AED ${value.toFixed(0)}`;
}

/**
 * Full comma-form for hover tooltips. "AED 131,000,000,000" — pairs with
 * `formatLargeAED` via the title attribute.
 */
export function formatAEDFull(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

// A median price/sqft from a handful of sales is statistically meaningless
// (e.g. 120 AED/sqft off a single transaction looks like a bug). Below this
// sample we suppress the number and show a "limited data" note instead.
export const MIN_SALES_FOR_PRICE = 10;

export function priceReliable(salesCount: number | null | undefined): boolean {
  return salesCount == null || salesCount >= MIN_SALES_FOR_PRICE;
}

export function limitedSalesNote(salesCount: number | null | undefined): string {
  const n = salesCount ?? 0;
  return `Limited · ${n} sale${n === 1 ? '' : 's'}`;
}

// Display cap mirrors the backend (DISPLAY_YIELD_CAP_PCT in schemas/dld.py).
// Yields at or above the cap are presented as "≥20%" so users know the
// number is bounded — raw DLD yields above 20% are nearly always artefacts.
export const YIELD_DISPLAY_CAP = 20.0;

// Cumulative appreciation can run very high for emerging/low-base areas
// (e.g. a 34%/yr CAGR compounds to 331% over 5 years). The raw number is real
// but reads as implausible to investors, so cumulative figures are presented
// capped as "≥200%". Annualised CAGR (which stays sane) should be shown
// alongside as the comparable metric.
export const APPRECIATION_DISPLAY_CAP = 200.0;

export function formatAppreciation(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= APPRECIATION_DISPLAY_CAP) return `≥${APPRECIATION_DISPLAY_CAP.toFixed(0)}%`;
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function isAppreciationCapped(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value >= APPRECIATION_DISPLAY_CAP;
}

export function formatYield(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= YIELD_DISPLAY_CAP) return `≥${YIELD_DISPLAY_CAP.toFixed(0)}%`;
  return `${value.toFixed(digits)}%`;
}

export function isYieldCapped(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value >= YIELD_DISPLAY_CAP;
}

export function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value);
}
