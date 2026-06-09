'use client';

import { useEffect, useState } from 'react';
import { Check, X, Clock } from 'lucide-react';
import type { AccountClaim, ClaimStatusType } from '@/lib/types';
import { adminListClaims, adminApproveClaim, adminRejectClaim } from '@/lib/api';

const FILTERS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];

const TYPE_BADGE: Record<string, string> = {
  broker: 'border-accent/40 text-accent bg-accent/5',
  agency: 'border-positive/40 text-positive bg-positive/5',
  developer: 'border-warning/40 text-warning bg-warning/5',
};

export function AdminClaimsClient() {
  const [claims, setClaims] = useState<AccountClaim[]>([]);
  const [filter, setFilter] = useState('pending');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setClaims(await adminListClaims(filter || undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claims.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filter]);

  async function act(id: string, kind: 'approve' | 'reject') {
    setBusy(id);
    try {
      if (kind === 'approve') await adminApproveClaim(id);
      else await adminRejectClaim(id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === f.key ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg hover:bg-bg-elev/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-fg-muted">Loading…</div>
      ) : error ? (
        <div className="text-sm text-negative">{error}</div>
      ) : !claims.length ? (
        <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
          No claims in this view.
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-bg-card overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Type</th>
                <th>Target</th>
                <th>Claimant</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Submitted</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`inline-flex items-center text-[10px] tabular border rounded px-1.5 py-0.5 ${TYPE_BADGE[c.claim_type] ?? 'border-border'}`}>
                      {c.claim_type}
                    </span>
                  </td>
                  <td className="text-fg">
                    <div className="font-medium">{c.target_name ?? c.target_id}</div>
                    <div className="text-[11px] text-fg-subtle tabular">#{c.target_id}</div>
                  </td>
                  <td className="text-fg">
                    {c.claimant_name}
                    {c.claimant_company && <div className="text-[11px] text-fg-subtle">{c.claimant_company}</div>}
                  </td>
                  <td className="text-[11px] text-fg-muted">
                    {c.claimant_email && <div>{c.claimant_email}</div>}
                    {c.claimant_phone && <div>{c.claimant_phone}</div>}
                  </td>
                  <td>
                    <StatusPill status={c.status} />
                  </td>
                  <td className="text-[11px] text-fg-muted tabular">{c.created_at.slice(0, 10)}</td>
                  <td className="text-right">
                    {c.status === 'pending' ? (
                      <div className="inline-flex gap-1">
                        <button
                          disabled={busy === c.id}
                          onClick={() => act(c.id, 'approve')}
                          className="inline-flex items-center gap-1 text-[11px] text-positive border border-positive/30 rounded px-2 py-1 hover:bg-positive/10 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" strokeWidth={2.5} /> Approve
                        </button>
                        <button
                          disabled={busy === c.id}
                          onClick={() => act(c.id, 'reject')}
                          className="inline-flex items-center gap-1 text-[11px] text-negative border border-negative/30 rounded px-2 py-1 hover:bg-negative/10 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" strokeWidth={2.5} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-fg-subtle">{c.review_note ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ClaimStatusType }) {
  if (status === 'approved') return <span className="inline-flex items-center gap-1 text-[11px] text-positive"><Check className="h-3 w-3" /> Approved</span>;
  if (status === 'rejected') return <span className="inline-flex items-center gap-1 text-[11px] text-negative"><X className="h-3 w-3" /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] text-warning"><Clock className="h-3 w-3" /> Pending</span>;
}
