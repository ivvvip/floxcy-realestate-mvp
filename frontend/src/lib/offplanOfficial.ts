// Shared display helpers for the official DLD off-plan registry (Phase 3).
// Construction stage is derived from PERCENT_COMPLETED; the ACTIVE/PENDING
// status pill comes from the official PROJECT_STATUS field. Both list cards
// and the detail page use these so the labels never drift.

export interface CompletionStage {
  emoji: string;
  label: string;
  /** tailwind text colour token for the stage chip */
  tone: string;
}

export function completionStage(pct: number | null): CompletionStage {
  if (pct == null) return { emoji: '🏗️', label: 'Under Construction', tone: 'text-accent' };
  if (pct >= 100) return { emoji: '✅', label: 'Completed', tone: 'text-positive' };
  if (pct >= 75) return { emoji: '🔨', label: 'Near Completion', tone: 'text-positive' };
  if (pct >= 50) return { emoji: '🔨', label: 'Mid Construction', tone: 'text-accent' };
  if (pct >= 25) return { emoji: '🏗️', label: 'Under Construction', tone: 'text-accent' };
  if (pct > 0) return { emoji: '🏗️', label: 'Early Construction', tone: 'text-accent' };
  return { emoji: '📋', label: 'Just Launched', tone: 'text-fg-muted' };
}

export interface StatusPill {
  label: string;
  className: string;
}

export function statusPill(status: string | null): StatusPill {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') {
    return { label: 'Active', className: 'border-positive/40 text-positive bg-positive/5' };
  }
  if (s.startsWith('PENDING')) {
    return { label: 'Pending', className: 'border-accent/40 text-accent bg-accent/5' };
  }
  return { label: status || '—', className: 'border-border text-fg-muted' };
}

/** "30 Jun 2028" from an ISO date, or null. */
export function formatHandover(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
