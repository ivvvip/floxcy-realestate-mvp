'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import type { UserFeedbackItem, FeedbackStats } from '@/lib/types';
import { adminListFeedback, adminFeedbackStats } from '@/lib/api';

export function AdminFeedbackClient() {
  const [items, setItems] = useState<UserFeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [i, s] = await Promise.all([adminListFeedback(), adminFeedbackStats()]);
        setItems(i); setStats(s); setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load feedback.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Total responses" value={String(stats?.total ?? 0)} />
        <Stat label="Avg rating" value={stats?.avg_rating != null ? `${stats.avg_rating} / 5` : '—'} accent />
        <Stat label="With email" value={String(items.filter((i) => i.email).length)} />
      </div>

      {!items.length ? (
        <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
          No feedback yet.
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-bg-card overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Rating</th>
                <th>Page</th>
                <th>Looking for</th>
                <th>Missing / confusing</th>
                <th>Email</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap">
                    {f.rating != null ? (
                      <span className="inline-flex items-center gap-0.5 text-accent">
                        {Array.from({ length: f.rating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-accent" strokeWidth={0} />
                        ))}
                        <span className="ml-1 text-[11px] text-fg-muted tabular">{f.rating}/5</span>
                      </span>
                    ) : <span className="text-fg-subtle text-[11px]">—</span>}
                  </td>
                  <td className="text-[11px] text-fg-muted font-mono max-w-[140px] truncate" title={f.page_url ?? ''}>{f.page_url ?? '—'}</td>
                  <td className="text-xs text-fg max-w-[200px]">{f.looking_for ?? '—'}</td>
                  <td className="text-xs text-fg max-w-[200px]">{f.missing ?? '—'}</td>
                  <td className="text-[11px] text-fg-muted">{f.email ?? '—'}</td>
                  <td className="text-[11px] text-fg-subtle tabular whitespace-nowrap">{f.created_at.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`mt-1 text-lg tabular font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>{value}</div>
    </div>
  );
}
