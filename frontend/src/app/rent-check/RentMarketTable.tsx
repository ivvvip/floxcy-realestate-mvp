'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowUp, Database, Loader2, MapPin, TrendingDown, TrendingUp,
} from 'lucide-react';
import { getRentsByArea } from '@/lib/api';
import { formatAED, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RentRankingResponse } from '@/lib/types';

type Size = 'studio' | '1br' | '2br' | '3br';

const SIZE_LABELS: Record<Size, string> = {
  studio: 'Studio',
  '1br': '1 Bedroom',
  '2br': '2 Bedroom',
  '3br': '3 Bedroom',
};

export function RentMarketTable() {
  const [size, setSize] = useState<Size>('1br');
  const [cheapest, setCheapest] = useState<RentRankingResponse | null>(null);
  const [expensive, setExpensive] = useState<RentRankingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [c, e] = await Promise.all([
          getRentsByArea({ direction: 'cheapest', size, prop_sub_type: 'Flat', limit: 5 }),
          getRentsByArea({ direction: 'expensive', size, prop_sub_type: 'Flat', limit: 5 }),
        ]);
        if (cancelled) return;
        setCheapest(c);
        setExpensive(e);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load rent rankings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [size]);

  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
            Dubai rent market — by area
          </h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Median annual rent across the 284 DLD areas. Sample-floor enforced.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(Object.keys(SIZE_LABELS) as Size[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                size === s
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border bg-bg-elev/50 text-fg-muted hover:text-fg'
              )}
            >
              {SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <RentList
          title="Cheapest 5"
          direction="cheapest"
          data={cheapest}
          loading={loading}
          error={error}
        />
        <RentList
          title="Most expensive 5"
          direction="expensive"
          data={expensive}
          loading={loading}
          error={error}
        />
      </div>
      <div className="border-t border-border px-4 py-2 text-[10px] text-fg-subtle flex items-center gap-1.5">
        <Database className="h-2.5 w-2.5" strokeWidth={2.5} />
        Source: DLD Ejari contracts · sample-floor enforced (n ≥ 30)
      </div>
    </section>
  );
}

function RentList({
  title, direction, data, loading, error,
}: {
  title: string;
  direction: 'cheapest' | 'expensive';
  data: RentRankingResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const TitleIcon = direction === 'cheapest' ? ArrowDown : ArrowUp;
  const tone = direction === 'cheapest' ? 'text-positive' : 'text-warning';
  return (
    <div className="p-4">
      <h3 className={cn('text-xs font-semibold inline-flex items-center gap-1.5 mb-2', tone)}>
        <TitleIcon className="h-3 w-3" strokeWidth={2.5} />
        {title}
      </h3>
      {loading ? (
        <div className="py-6 text-center text-[11px] text-fg-subtle inline-flex items-center justify-center gap-1.5 w-full">
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
          Loading rent rankings…
        </div>
      ) : error ? (
        <p className="text-[11px] text-negative">{error}</p>
      ) : !data || !data.items.length ? (
        <p className="text-[11px] text-fg-subtle">No data for this size yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {data.items.map((it) => (
            <li key={it.area_name_norm} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="flex-1 truncate text-fg">{it.area_name}</span>
              <span className="tabular text-fg font-medium">
                {formatAED(it.median_annual_rent, { compact: true })}
              </span>
              <span className="text-[10px] text-fg-subtle tabular w-12 text-right">
                n={formatNumber(it.sample_count, 0)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {data && data.items.length > 0 && (
        <p className="mt-2 text-[10px] text-fg-subtle">
          Median rent/sqft range:{' '}
          {Math.min(...data.items.map((i) => i.median_rent_per_sqft)).toFixed(0)}–
          {Math.max(...data.items.map((i) => i.median_rent_per_sqft)).toFixed(0)} AED
        </p>
      )}
    </div>
  );
}

// Suppress unused warnings (kept for future enhancements)
void TrendingDown; void TrendingUp;
