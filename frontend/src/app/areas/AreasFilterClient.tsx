'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Area } from '@/lib/types';
import { AreaCard } from '@/components/AreaCard';
import { formatAED, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';

type SortKey = 'name' | 'yield' | 'price' | 'appreciation' | 'score';
type TypeFilter = 'all' | 'residential' | 'commercial' | 'mixed';

interface Props {
  areas: Area[];
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'yield', label: 'Highest yield' },
  { value: 'appreciation', label: 'Highest appreciation' },
  { value: 'price', label: 'Lowest price/sqft' },
  { value: 'score', label: 'Highest investment score' },
];

export function AreasFilterClient({ areas }: Props) {
  const priceRange = useMemo(() => {
    const prices = areas
      .map((a) => a.latest_price_per_sqft ?? 0)
      .filter((p) => p > 0);
    return [Math.min(...prices, 500), Math.max(...prices, 3000)] as const;
  }, [areas]);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [minYield, setMinYield] = useState(0);
  const [maxPrice, setMaxPrice] = useState(priceRange[1]);
  const [sortBy, setSortBy] = useState<SortKey>('score');

  const filtered = useMemo(() => {
    const list = areas.filter((a) => {
      if (typeFilter !== 'all' && a.area_type !== typeFilter) return false;
      if ((a.latest_yield ?? 0) < minYield) return false;
      if (a.latest_price_per_sqft && a.latest_price_per_sqft > maxPrice) return false;
      return true;
    });
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'yield':
          return (b.latest_yield ?? 0) - (a.latest_yield ?? 0);
        case 'price':
          return (a.latest_price_per_sqft ?? Infinity) - (b.latest_price_per_sqft ?? Infinity);
        case 'appreciation':
          return (b.appreciation_1y ?? 0) - (a.appreciation_1y ?? 0);
        case 'score':
          return (b.investment_score ?? 0) - (a.investment_score ?? 0);
      }
    });
    return list;
  }, [areas, typeFilter, minYield, maxPrice, sortBy]);

  const reset = () => {
    setTypeFilter('all');
    setMinYield(0);
    setMaxPrice(priceRange[1]);
    setSortBy('score');
  };

  return (
    <div className="space-y-6">
      <div className="surface-card p-5">
        <div className="grid gap-5 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Type
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['all', 'residential', 'mixed', 'commercial'] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                    typeFilter === t
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-border bg-bg-elev text-fg-muted hover:text-fg'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Min yield: {formatPercent(minYield, 1)}
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={minYield}
              onChange={(e) => setMinYield(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Max price/sqft: {formatAED(maxPrice)}
            </label>
            <input
              type="range"
              min={priceRange[0]}
              max={priceRange[1]}
              step={50}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Sort by
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="mt-2 w-full rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
          <span>
            Showing <span className="text-fg">{filtered.length}</span> of {areas.length} areas
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-accent hover:underline"
          >
            Reset filters
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-fg-muted">No areas match your filters.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 text-sm font-medium text-accent hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid gap-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((area) => (
            <AreaCard key={area.id} area={area} />
          ))}
        </div>
      )}
    </div>
  );
}
