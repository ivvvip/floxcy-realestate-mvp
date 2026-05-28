'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Deal } from '@/lib/types';
import {
  adminApproveOpportunity,
  adminListPendingOpportunities,
  adminRejectOpportunity,
} from '@/lib/api';
import { formatAED, formatPercent } from '@/lib/format';

export function AdminOpportunitiesClient() {
  const [pending, setPending] = useState<Deal[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setPending(await adminListPendingOpportunities());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function approve(id: string) {
    try {
      await adminApproveOpportunity(id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Approval failed.');
    }
  }

  async function reject(id: string) {
    if (!confirm('Reject this opportunity?')) return;
    try {
      await adminRejectOpportunity(id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rejection failed.');
    }
  }

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;

  if (!pending.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
        No opportunities awaiting review.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((d) => (
        <div key={d.id} className="border border-border rounded-lg bg-bg-card overflow-hidden">
          <div
            className="px-4 py-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-center cursor-pointer"
            onClick={() => setExpanded((e) => (e === d.id ? null : d.id))}
          >
            <div className="md:col-span-2">
              <div className="text-sm font-medium text-fg">{d.title}</div>
              <div className="text-[11px] text-fg-muted">
                {d.area} · {d.emirate} · {d.property_type}
              </div>
            </div>
            <div className="text-sm text-fg-muted">
              {formatAED(Number(d.price), { compact: true })}
            </div>
            <div className="text-sm text-fg-muted">
              {d.expected_gross_yield != null
                ? `${formatPercent(d.expected_gross_yield, 2)} yield`
                : '—'}
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  approve(d.id);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-positive/20 text-positive text-xs px-2 hover:bg-positive/30"
              >
                <Check className="h-3 w-3" strokeWidth={2} /> Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  reject(d.id);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-negative/20 text-negative text-xs px-2 hover:bg-negative/30"
              >
                <X className="h-3 w-3" strokeWidth={2} /> Reject
              </button>
            </div>
          </div>
          {expanded === d.id && (
            <div className="border-t border-border px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-fg-muted">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                  Why opportunity
                </div>
                <p className="mt-1 whitespace-pre-line">{d.why_opportunity || '—'}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                  Risks
                </div>
                <p className="mt-1 whitespace-pre-line">{d.risk_summary || '—'}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                  Strategy / risk
                </div>
                <p className="mt-1 capitalize">
                  {d.strategy_type} · {d.risk_level}
                  {d.confidence_score != null && ` · confidence ${d.confidence_score}`}
                </p>
              </div>
              {d.broker && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                    Submitted by
                  </div>
                  <p className="mt-1">
                    {d.broker.full_name}
                    {d.broker.company_name && ` · ${d.broker.company_name}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
