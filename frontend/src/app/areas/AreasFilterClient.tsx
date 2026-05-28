'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, List, SlidersHorizontal, MapPin } from 'lucide-react';
import type { Area, OpportunityResult, OpportunityTier } from '@/lib/types';
import { AreaCard } from '@/components/AreaCard';
import { DataBadge } from '@/components/data/DataBadge';
import { FilterChip } from '@/components/data/FilterChip';
import { formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { getOpportunities } from '@/lib/api';

type TypeFilter = 'all' | 'residential' | 'commercial' | 'mixed';
type SortKey = 'name' | 'yield' | 'price' | 'appreciation' | 'score' | 'undervaluation';

const TIER_LABEL: Record<OpportunityTier, string> = {
  strong: 'Strong Opportunity',
  moderate: 'Moderate',
  neutral: 'Fair Value',
  overpriced: 'Overvalued',
};
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'grid';

interface Props {
  areas: Area[];
}

const TYPE_OPTIONS: TypeFilter[] = ['all', 'residential', 'commercial', 'mixed'];

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
  const [minScore, setMinScore] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('undervaluation');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [view, setView] = useState<ViewMode>('table');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Lazy-load undervaluation scores once so the screener can sort + display them.
  const [oppByArea, setOppByArea] = useState<Record<string, OpportunityResult>>({});
  useEffect(() => {
    let cancelled = false;
    getOpportunities({ limit: 100 })
      .then((r) => {
        if (cancelled) return;
        const map: Record<string, OpportunityResult> = {};
        for (const o of r.results) map[o.area_id] = o;
        setOppByArea(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = areas.filter((a) => {
      if (typeFilter !== 'all' && a.area_type !== typeFilter) return false;
      if ((a.latest_yield ?? 0) < minYield) return false;
      if (a.latest_price_per_sqft && a.latest_price_per_sqft > maxPrice) return false;
      if ((a.investment_score ?? 0) < minScore) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'yield':
          return ((a.latest_yield ?? 0) - (b.latest_yield ?? 0)) * dir;
        case 'price':
          return (
            ((a.latest_price_per_sqft ?? 0) -
              (b.latest_price_per_sqft ?? 0)) *
            dir
          );
        case 'appreciation':
          return ((a.appreciation_1y ?? 0) - (b.appreciation_1y ?? 0)) * dir;
        case 'score':
          return ((a.investment_score ?? 0) - (b.investment_score ?? 0)) * dir;
        case 'undervaluation': {
          const sa = oppByArea[a.id]?.score ?? -1;
          const sb = oppByArea[b.id]?.score ?? -1;
          return (sa - sb) * dir;
        }
      }
    });
    return list;
  }, [areas, typeFilter, minYield, maxPrice, minScore, sortKey, sortDir, oppByArea]);

  const reset = () => {
    setTypeFilter('all');
    setMinYield(0);
    setMaxPrice(priceRange[1]);
    setMinScore(0);
    setSortKey('score');
    setSortDir('desc');
  };

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (typeFilter !== 'all')
    activeFilters.push({
      key: 'type',
      label: `Type: ${typeFilter}`,
      clear: () => setTypeFilter('all'),
    });
  if (minYield > 0)
    activeFilters.push({
      key: 'yield',
      label: `Yield ≥ ${formatPercent(minYield, 1)}`,
      clear: () => setMinYield(0),
    });
  if (maxPrice < priceRange[1])
    activeFilters.push({
      key: 'price',
      label: `Price ≤ ${formatNumber(maxPrice)}`,
      clear: () => setMaxPrice(priceRange[1]),
    });
  if (minScore > 0)
    activeFilters.push({
      key: 'score',
      label: `Score ≥ ${minScore}`,
      clear: () => setMinScore(0),
    });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Filter panel */}
      <aside className="lg:col-span-3">
        <div className="lg:sticky lg:top-16 border border-border rounded-lg bg-bg-card">
          <div className="chart-header">
            <span className="chart-header-label inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
              Filters
              {activeFilters.length > 0 && (
                <span className="ml-1 rounded bg-accent/10 text-accent px-1.5 text-[10px] tabular">
                  {activeFilters.length}
                </span>
              )}
            </span>
            <button
              type="button"
              className="text-[11px] text-fg-muted hover:text-fg lg:hidden"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className={cn('p-4 space-y-5', !filtersOpen && 'hidden lg:block')}>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Type
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TYPE_OPTIONS.map((t) => (
                  <FilterChip
                    key={t}
                    label={t}
                    active={typeFilter === t}
                    onClick={() => setTypeFilter(t)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-fg-subtle font-medium">
                <span className="uppercase tracking-wide">Min yield</span>
                <span className="tabular text-fg">
                  {formatPercent(minYield, 1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={minYield}
                onChange={(e) => setMinYield(Number(e.target.value))}
                className="mt-2 w-full accent-accent"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-fg-subtle font-medium">
                <span className="uppercase tracking-wide">Max AED/sqft</span>
                <span className="tabular text-fg">{formatNumber(maxPrice)}</span>
              </div>
              <input
                type="range"
                min={priceRange[0]}
                max={priceRange[1]}
                step={50}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="mt-2 w-full accent-accent"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-fg-subtle font-medium">
                <span className="uppercase tracking-wide">Min score</span>
                <span className="tabular text-fg">{minScore.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="mt-2 w-full accent-accent"
              />
            </div>

            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="text-xs font-medium text-accent hover:text-accent/80"
              >
                Reset all filters
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Results */}
      <div className="lg:col-span-9 min-w-0">
        {/* Active filter chips + view toggle */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-fg-muted">
              <span className="text-fg tabular">{filtered.length}</span> of{' '}
              <span className="tabular">{areas.length}</span> areas
            </span>
            {activeFilters.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                active
                onDismiss={f.clear}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="segmented">
              <button
                type="button"
                data-active={view === 'table'}
                onClick={() => setView('table')}
                aria-label="Table view"
              >
                <List className="h-3.5 w-3.5 inline" strokeWidth={2} />
              </button>
              <button
                type="button"
                data-active={view === 'grid'}
                onClick={() => setView('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5 inline" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <p className="text-sm text-fg-muted">No areas match your filters.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 text-xs font-medium text-accent hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : view === 'table' ? (
          <div className="border border-border rounded-lg overflow-hidden bg-bg-card">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortHeader
                      label="Area"
                      active={sortKey === 'name'}
                      dir={sortDir}
                      onClick={() => toggleSort('name')}
                    />
                    <th>Type</th>
                    <SortHeader
                      label="AED/sqft"
                      align="right"
                      active={sortKey === 'price'}
                      dir={sortDir}
                      onClick={() => toggleSort('price')}
                    />
                    <SortHeader
                      label="Yield"
                      align="right"
                      active={sortKey === 'yield'}
                      dir={sortDir}
                      onClick={() => toggleSort('yield')}
                    />
                    <SortHeader
                      label="1Y"
                      align="right"
                      active={sortKey === 'appreciation'}
                      dir={sortDir}
                      onClick={() => toggleSort('appreciation')}
                    />
                    <SortHeader
                      label="Score"
                      align="right"
                      active={sortKey === 'score'}
                      dir={sortDir}
                      onClick={() => toggleSort('score')}
                    />
                    <SortHeader
                      label="Undervalued"
                      align="right"
                      active={sortKey === 'undervaluation'}
                      dir={sortDir}
                      onClick={() => toggleSort('undervaluation')}
                    />
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="group cursor-pointer">
                      <td>
                        <Link
                          href={`/areas/${a.id}`}
                          className="font-medium text-fg group-hover:text-accent transition-colors"
                        >
                          {a.name}
                        </Link>
                        {a.name_arabic && (
                          <div
                            className="text-[11px] text-fg-muted"
                            dir="rtl"
                          >
                            {a.name_arabic}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="pill">{a.area_type}</span>
                      </td>
                      <td className="num">
                        {a.latest_price_per_sqft != null
                          ? formatNumber(a.latest_price_per_sqft, 0)
                          : '—'}
                      </td>
                      <td className="num">
                        {a.latest_yield != null
                          ? formatPercent(a.latest_yield, 2)
                          : '—'}
                      </td>
                      <td className="num">
                        <DataBadge value={a.appreciation_1y} format="percent" />
                      </td>
                      <td className="num font-medium">
                        {a.investment_score != null
                          ? a.investment_score.toFixed(1)
                          : '—'}
                      </td>
                      <td className="num">
                        {oppByArea[a.id] ? (
                          <span
                            className={cn(
                              'pill tabular',
                              oppByArea[a.id].tier === 'strong' && 'pill-positive',
                              oppByArea[a.id].tier === 'moderate' && 'pill-accent',
                              oppByArea[a.id].tier === 'overpriced' && 'pill-negative'
                            )}
                            title={TIER_LABEL[oppByArea[a.id].tier]}
                          >
                            {oppByArea[a.id].score}
                          </span>
                        ) : (
                          <span className="text-fg-subtle tabular">—</span>
                        )}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                          <MapPin className="h-3 w-3" strokeWidth={2} />
                          {a.city}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((area) => (
              <AreaCard key={area.id} area={area} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: 'right' | 'left';
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-fg transition-colors',
          align === 'right' && 'flex-row-reverse',
          active && 'text-fg'
        )}
      >
        <span>{label}</span>
        <span className="text-[10px] text-fg-subtle">
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

