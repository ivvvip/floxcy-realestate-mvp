'use client';

import { useEffect, useState } from 'react';
import type { SubscriptionsOverview } from '@/lib/types';
import { adminListSubscriptions } from '@/lib/api';

const KIND_BADGE: Record<string, string> = {
  user: 'border-accent/40 text-accent bg-accent/5',
  broker: 'border-positive/40 text-positive bg-positive/5',
  agency: 'border-warning/40 text-warning bg-warning/5',
  developer: 'border-border text-fg-muted',
};

export function AdminSubscriptionsClient() {
  const [data, setData] = useState<SubscriptionsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setData(await adminListSubscriptions());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load subscriptions.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;
  if (!data) return null;

  const rows = kindFilter ? data.rows.filter((r) => r.kind === kindFilter) : data.rows;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total" value={data.counts.total ?? 0} />
        <Stat label="Paid users" value={data.counts.paid_users ?? 0} accent />
        <Stat label="Active users" value={data.counts.active_users ?? 0} />
        <Stat label="Trial users" value={data.counts.trial_users ?? 0} />
        <Stat label="Profiles" value={data.counts.profiles ?? 0} />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {['', 'user', 'broker', 'agency', 'developer'].map((k) => (
          <button
            key={k || 'all'}
            onClick={() => setKindFilter(k)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              kindFilter === k ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg hover:bg-bg-elev/40'
            }`}
          >
            {k ? k[0].toUpperCase() + k.slice(1) + 's' : 'All'}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-lg bg-bg-card overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Name</th>
              <th>Account / tier</th>
              <th>Status</th>
              <th className="text-center">Paid</th>
              <th>Renews</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td>
                  <span className={`inline-flex items-center text-[10px] tabular border rounded px-1.5 py-0.5 ${KIND_BADGE[r.kind] ?? 'border-border'}`}>
                    {r.kind}
                  </span>
                </td>
                <td className="text-fg">{r.name}</td>
                <td className="text-fg-muted tabular text-[11px]">{r.account_or_tier}</td>
                <td className="text-fg-muted text-[11px]">{r.status}</td>
                <td className="text-center">
                  {r.is_paid ? <span className="text-positive">●</span> : <span className="text-fg-subtle">○</span>}
                </td>
                <td className="text-[11px] text-fg-muted tabular">{r.subscription_end?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`mt-1 text-lg tabular font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>{value}</div>
    </div>
  );
}
