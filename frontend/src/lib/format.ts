export function formatAED(value: number, opts?: { compact?: boolean }) {
  if (!Number.isFinite(value)) return '—';
  if (opts?.compact && Math.abs(value) >= 1_000_000) {
    return `AED ${(value / 1_000_000).toFixed(2)}M`;
  }
  if (opts?.compact && Math.abs(value) >= 1_000) {
    return `AED ${(value / 1_000).toFixed(1)}K`;
  }
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

// Display cap mirrors the backend (DISPLAY_YIELD_CAP_PCT in schemas/dld.py).
// Yields at or above the cap are presented as "≥20%" so users know the
// number is bounded — raw DLD yields above 20% are nearly always artefacts.
export const YIELD_DISPLAY_CAP = 20.0;

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
