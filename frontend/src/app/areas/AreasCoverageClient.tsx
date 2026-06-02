'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Database, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { AreaCoverageItem, CoverageTier } from '@/lib/types';

interface Props {
  initial: AreaCoverageItem[];
}

type SortKey = 'volume' | 'investment_score' | 'yield' | 'name';
const SORT_LABEL: Record<SortKey, string> = {
  volume: 'Volume (sales + rents)',
  investment_score: 'Investment score',
  yield: 'Yield %',
  name: 'Name A→Z',
};

type TypeFilter = '' | 'residential' | 'commercial' | 'mixed';
type TierFilter = '' | CoverageTier;

const PAGE_SIZE = 30;

export function AreasCoverageClient({ initial }: Props) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('');
  const [tier, setTier] = useState<TierFilter>('');
  const [sortBy, setSortBy] = useState<SortKey>('volume');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let xs = initial;
    if (qq) xs = xs.filter((a) => a.name.toLowerCase().includes(qq));
    if (type) xs = xs.filter((a) => a.area_type === type);
    if (tier) xs = xs.filter((a) => a.coverage_tier === tier);

    const tierRank: Record<CoverageTier, number> = {
      full: 0,
      partial: 1,
      limited: 2,
      none: 3,
    };
    const sorted = [...xs].sort((a, b) => {
      const ta = tierRank[a.coverage_tier] - tierRank[b.coverage_tier];
      if (ta !== 0) return ta;
      switch (sortBy) {
        case 'investment_score':
          return (b.investment_score ?? 0) - (a.investment_score ?? 0);
        case 'yield':
          return (b.rental_yield_pct ?? 0) - (a.rental_yield_pct ?? 0);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return (
            (b.rent_count_2026 + b.sales_count) -
            (a.rent_count_2026 + a.sales_count)
          );
      }
    });
    return sorted;
  }, [initial, q, type, tier, sortBy]);

  // Reset to page 0 whenever filters change
  useEffect(() => {
    setPage(0);
  }, [q, type, tier, sortBy]);

  const showFrom = filtered.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min(filtered.length, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="card p-4 sm:p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="a_q"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Search
          </label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              id="a_q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Business Bay, Damac"
              className="input-field pl-9 min-h-[44px]"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="a_type"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Type
          </label>
          <select
            id="a_type"
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
            className="input-field mt-1 min-h-[44px]"
          >
            <option value="">All types</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="mixed">Mixed-use</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="a_tier"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Coverage
          </label>
          <select
            id="a_tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as TierFilter)}
            className="input-field mt-1 min-h-[44px]"
          >
            <option value="">All coverage</option>
            <option value="full">Full data</option>
            <option value="partial">Partial data</option>
            <option value="limited">Limited data</option>
            <option value="none">No data yet</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="a_sort"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Sort by
          </label>
          <select
            id="a_sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="input-field mt-1 min-h-[44px]"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="flex items-center justify-between text-[11px] text-fg-subtle px-1">
        <span>
          {filtered.length === 0
            ? 'No areas match'
            : `${showFrom.toLocaleString()}–${showTo.toLocaleString()} of ${filtered.length.toLocaleString()}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-fg-subtle">
          No areas match these filters.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <AreaCard key={a.id} a={a} />
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className={cn(
              'btn-secondary',
              page === 0 && 'opacity-40 cursor-not-allowed'
            )}
          >
            Previous
          </button>
          <span className="text-fg-subtle">
            Page <span className="font-mono text-fg">{page + 1}</span> of{' '}
            <span className="font-mono text-fg">
              {totalPages.toLocaleString()}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
            className={cn(
              'btn-secondary',
              page + 1 >= totalPages && 'opacity-40 cursor-not-allowed'
            )}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function AreaCard({ a }: { a: AreaCoverageItem }) {
  const tier = a.coverage_tier;
  const tierClass =
    tier === 'full'
      ? 'bg-positive/15 text-positive'
      : tier === 'partial'
        ? 'bg-accent/15 text-accent'
        : tier === 'limited'
          ? 'bg-warning/15 text-warning'
          : 'bg-bg-elev text-fg-subtle';
  const tierLabel =
    tier === 'full'
      ? 'Full data'
      : tier === 'partial'
        ? 'Partial data'
        : tier === 'limited'
          ? 'Limited data'
          : 'Data coming soon';

  return (
    <Link
      href={`/areas/${a.slug}`}
      className="card p-4 flex flex-col hover:border-accent/40 transition-colors min-h-[180px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate">{a.name}</div>
          <div className="mt-0.5 text-[11px] text-fg-muted">
            {a.city} · <span className="capitalize">{a.area_type}</span>
            {a.is_curated && (
              <span className="ml-1.5 text-[10px] text-accent">· curated</span>
            )}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
            tierClass
          )}
        >
          {tierLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Mini
          label="Median AED/sqft"
          value={
            a.median_price_per_sqft != null
              ? formatNumber(a.median_price_per_sqft, 0)
              : '—'
          }
        />
        <Mini
          label="Yield (capped)"
          value={
            a.rental_yield_pct != null
              ? `${a.rental_yield_pct.toFixed(2)}%`
              : '—'
          }
        />
        <Mini
          label="Sales 2026"
          value={a.sales_count.toLocaleString()}
          dim={a.sales_count === 0}
        />
        <Mini
          label="Rent contracts"
          value={a.rent_count_2026.toLocaleString()}
          dim={a.rent_count_2026 === 0}
        />
      </div>

      {a.rent_growth_yoy_pct != null && (
        <div className="mt-3 text-[11px] text-fg-subtle">
          YoY rent:{' '}
          <span
            className={cn(
              'font-mono',
              a.rent_growth_yoy_pct >= 0 ? 'text-positive' : 'text-negative'
            )}
          >
            {a.rent_growth_yoy_pct >= 0 ? '+' : ''}
            {a.rent_growth_yoy_pct.toFixed(1)}%
          </span>
        </div>
      )}

      <div className="mt-auto pt-3 flex items-center justify-between">
        {a.investment_score != null ? (
          <span className="text-[11px] text-fg-subtle">
            Score{' '}
            <span className="font-mono text-fg">
              {a.investment_score.toFixed(1)}/10
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-fg-subtle inline-flex items-center gap-1">
            <Database className="h-3 w-3" strokeWidth={2} /> DLD only
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
          Open
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

function Mini({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 font-mono',
          dim ? 'text-fg-subtle' : 'text-fg'
        )}
      >
        {value}
      </div>
    </div>
  );
}

