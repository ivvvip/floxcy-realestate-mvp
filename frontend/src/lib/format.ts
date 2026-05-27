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

export function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value);
}
