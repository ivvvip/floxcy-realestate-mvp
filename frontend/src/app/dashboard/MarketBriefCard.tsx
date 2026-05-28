'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Newspaper, Sparkles } from 'lucide-react';
import { getMarketBrief } from '@/lib/api';
import type { MarketBrief } from '@/lib/types';

export function MarketBriefCard() {
  const [brief, setBrief] = useState<MarketBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMarketBrief()
      .then((r) => {
        if (!cancelled) setBrief(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load brief');
      })
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
          <Newspaper className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          Daily market brief
        </span>
        {brief && (
          <span className="text-[11px] text-fg-subtle tabular flex items-center gap-1.5">
            {brief.cached && <span className="pill">cached</span>}
            {brief.fallback_used && (
              <span className="pill pill-negative">rules-fallback</span>
            )}
            {brief.model && (
              <span className="pill">{brief.model.split('/').pop()}</span>
            )}
            <span>{brief.as_of}</span>
          </span>
        )}
      </div>
      <div className="p-5">
        {loading ? (
          <div className="text-xs text-fg-muted inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" strokeWidth={2} />
            Generating today&rsquo;s brief…
          </div>
        ) : error ? (
          <div className="text-xs text-negative">{error}</div>
        ) : !brief || brief.brief.length === 0 ? (
          <div className="text-xs text-fg-subtle">No brief available.</div>
        ) : (
          <ul className="space-y-3">
            {brief.brief.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg leading-tight">
                    {b.headline}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                    {b.body}
                    {b.area_name && (
                      <>
                        {' '}
                        <Link
                          href={`/areas?q=${encodeURIComponent(b.area_name)}`}
                          className="text-accent hover:underline"
                        >
                          {b.area_name} →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border px-4 py-2 text-[11px] text-fg-subtle italic">
        AI-generated. Grounded in the latest data snapshot. Not investment advice.
      </div>
    </div>
  );
}
