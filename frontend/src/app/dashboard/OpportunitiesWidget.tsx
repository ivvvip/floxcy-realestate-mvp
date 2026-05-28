'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { getOpportunities } from '@/lib/api';
import type { OpportunityResult, OpportunityType } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';

const TYPE_TONE: Record<OpportunityType, string> = {
  'Premium Hold': 'pill-accent',
  'Growth Opportunity': 'pill-positive',
  Speculative: 'pill-negative',
  'Income Opportunity': 'pill-positive',
  'Value Opportunity': 'pill-accent',
  Balanced: '',
};

export function OpportunitiesWidget() {
  const [rows, setRows] = useState<OpportunityResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOpportunities({ limit: 5 })
      .then((r) => {
        if (!cancelled) setRows(r.opportunities);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="chart-header">
        <span className="chart-header-label inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          Today&rsquo;s top opportunities
        </span>
        <Link
          href="/opportunities"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent/80"
        >
          View all
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-fg-subtle">
          Computing rankings…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-fg-subtle">
          No opportunities yet.
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8 text-right">#</th>
                <th>Area</th>
                <th>Type</th>
                <th className="text-right">Score</th>
                <th className="text-right">Yield</th>
                <th className="text-right">AED/sqft</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.area_id} className="group">
                  <td className="num text-fg-subtle">{i + 1}</td>
                  <td>
                    <Link
                      href={`/areas/${o.area_id}`}
                      className="font-medium text-fg group-hover:text-accent transition-colors"
                    >
                      {o.area_name}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'pill',
                        TYPE_TONE[o.opportunity_type] ?? ''
                      )}
                    >
                      {o.opportunity_type}
                    </span>
                  </td>
                  <td className="num font-semibold text-fg">{o.opportunity_score}</td>
                  <td className="num">
                    {formatPercent(o.key_metrics.rental_yield, 2)}
                  </td>
                  <td className="num">
                    {formatNumber(o.key_metrics.price_per_sqft, 0)}
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
