'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { getDldBuildings } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { DldBuildingItem } from '@/lib/types';

interface AreaOption {
  name: string;
  name_norm: string;
}

interface Props {
  initialItems: DldBuildingItem[];
  initialTotal: number;
  areaOptions: AreaOption[];
}

type SortKey = 'rent_count' | 'rent_per_sqft' | 'avg_rent' | 'occupancy';
const SORT_LABEL: Record<SortKey, string> = {
  rent_count: 'Most active contracts',
  rent_per_sqft: 'Highest rent / sqft',
  avg_rent: 'Highest avg rent',
  occupancy: 'Highest occupancy',
};

const PROP_TYPES = ['', 'Flat', 'Villa', 'Hotel Apartment'] as const;
type PropFilter = (typeof PROP_TYPES)[number];

const PAGE_SIZE = 24;

export function BuildingsIndexClient({
  initialItems,
  initialTotal,
  areaOptions,
}: Props) {
  const [items, setItems] = useState<DldBuildingItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [area, setArea] = useState<AreaOption | null>(null);
  const [project, setProject] = useState('');
  const [qSearch, setQSearch] = useState('');
  const [propType, setPropType] = useState<PropFilter>('');
  const [buildingType, setBuildingType] = useState<
    '' | 'tower' | 'complex' | 'villa_community' | 'under_construction'
  >('');
  const [sortBy, setSortBy] = useState<SortKey>('rent_count');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip the initial fetch — server already prefilled it.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getDldBuildings({
          area: area?.name_norm,
          project: project.trim() || undefined,
          q: qSearch.trim() || undefined,
          prop_sub_type: propType || undefined,
          building_type: buildingType || undefined,
          sort_by: sortBy,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        setItems(res.items);
        setTotal(res.total_available);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load buildings.');
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, project, qSearch, propType, buildingType, sortBy, page]);

  useEffect(() => {
    setPage(0);
  }, [area, project, qSearch, propType, buildingType, sortBy]);

  const showFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min(total, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Cross-search — searches project_name + master_project + area together */}
      <section className="card p-3 sm:p-4">
        <label
          htmlFor="b_q"
          className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
        >
          Search across building · community · area
        </label>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle"
            strokeWidth={2}
          />
          <input
            id="b_q"
            type="search"
            value={qSearch}
            onChange={(e) => setQSearch(e.target.value)}
            placeholder="e.g. Damac, Marsa Dubai, Burj Khalifa…"
            className="input-field pl-10 min-h-[44px] text-sm"
          />
        </div>
      </section>

      {/* Filter bar */}
      <section className="card p-4 sm:p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AreaSelect value={area} onChange={setArea} options={areaOptions} />
        <div>
          <label
            htmlFor="b_project"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Project name
          </label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              id="b_project"
              type="search"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. Arabian Ranches"
              className="input-field pl-9 min-h-[44px]"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="b_type"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Property type
          </label>
          <select
            id="b_type"
            value={propType}
            onChange={(e) => setPropType(e.target.value as PropFilter)}
            className="input-field mt-1 min-h-[44px]"
          >
            <option value="">All types</option>
            {PROP_TYPES.filter(Boolean).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="b_btype"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Building type
          </label>
          <select
            id="b_btype"
            value={buildingType}
            onChange={(e) =>
              setBuildingType(e.target.value as typeof buildingType)
            }
            className="input-field mt-1 min-h-[44px]"
          >
            <option value="">All types</option>
            <option value="tower">🏢 Single Tower</option>
            <option value="complex">🏘️ Residential Complex</option>
            <option value="villa_community">🏡 Villa Community</option>
            <option value="under_construction">🏗️ Under Construction</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="b_sort"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Sort by
          </label>
          <select
            id="b_sort"
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

      {/* Count line */}
      <div className="flex items-center justify-between text-[11px] text-fg-subtle px-1">
        <span>
          {loading
            ? 'Loading…'
            : total === 0
              ? 'No buildings match'
              : `${showFrom.toLocaleString()}–${showTo.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        {error && <span className="text-negative">{error}</span>}
      </div>

      {/* Cards grid */}
      {items.length === 0 && !loading ? (
        <div className="card p-8 text-center text-sm text-fg-subtle">
          No buildings match these filters. Try a different area or clear the
          project search.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => (
            <BuildingCard key={b.id} b={b} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className={cn(
              'btn-secondary',
              (page === 0 || loading) && 'opacity-40 cursor-not-allowed'
            )}
          >
            Previous
          </button>
          <span className="text-fg-subtle">
            Page <span className="font-mono text-fg">{page + 1}</span> of{' '}
            <span className="font-mono text-fg">{totalPages.toLocaleString()}</span>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages || loading}
            className={cn(
              'btn-secondary',
              (page + 1 >= totalPages || loading) && 'opacity-40 cursor-not-allowed'
            )}
          >
            Next
          </button>
        </div>
      )}

      <p className="text-[10px] text-fg-subtle px-1">
        Source: Dubai Land Department · Ejari rent contract registry. Income
        figures are displayed as ranges (e.g. &ldquo;AED 10M – 50M/year&rdquo;) to
        protect tenant-level economics. Open a building for the precise figure.
      </p>
    </div>
  );
}

function BuildingCard({ b }: { b: DldBuildingItem }) {
  const occ = b.occupancy_proxy_pct;
  const deltaPct = b.rent_psf_vs_area_pct;
  return (
    <Link
      href={`/buildings/${b.id}`}
      className="card p-4 flex flex-col hover:border-accent/40 transition-colors min-h-[180px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Building type badge */}
          {b.building_type_emoji && b.building_type_label && (
            <div className="mb-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                  b.building_type === 'under_construction'
                    ? 'border-warning/40 bg-warning/10 text-warning'
                    : b.building_type === 'complex'
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : 'border-border bg-bg-elev/50 text-fg-muted'
                )}
              >
                {b.building_type_emoji} {b.building_type_label}
              </span>
            </div>
          )}
          <div
            className="text-sm font-semibold text-fg truncate"
            title={b.display_name ?? b.project_name ?? ''}
          >
            {b.display_name ?? b.project_name ?? '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted truncate">
            {b.area_name ?? '—'}
            {b.prop_sub_type ? ` · ${b.prop_sub_type}` : ''}
            {b.age_years != null && (
              <> · Built ~{2026 - b.age_years} (<span className="font-mono">{b.age_years}y</span>)</>
            )}
            {b.is_identifiable === false && (
              <span className="ml-1 text-fg-subtle">· area-level</span>
            )}
          </div>
        </div>
        {b.is_freehold === true && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded bg-positive/15 px-1.5 py-0.5 text-[10px] text-positive">
            <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Freehold
          </span>
        )}
      </div>

      {/* Community aggregate notice */}
      {b.is_community_aggregate && b.master_project && (
        <div className="mt-2 rounded border border-border bg-bg-elev/30 px-2 py-1 text-[10px] text-fg-muted">
          🏘️ Part of <span className="text-fg">{b.master_project}</span> community
          {b.siblings_in_master_project && b.siblings_in_master_project > 1 && (
            <> · {b.siblings_in_master_project} aggregated buildings</>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
        {b.flats != null && (
          <span><span className="text-fg font-mono">{b.flats}</span> flats</span>
        )}
        {b.floors != null && (
          <span><span className="text-fg font-mono">{b.floors}</span> floors</span>
        )}
        <span>
          <span className="text-fg font-mono">{b.active_rent_count.toLocaleString()}</span> active rents
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Income range
          </div>
          <div className="mt-0.5 text-fg font-medium truncate">
            {b.income_range_label ?? '—'}
          </div>
        </div>
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Occupancy
          </div>
          <div className="mt-0.5 text-fg font-mono">
            {occ != null ? `${occ.toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

      {/* vs-area benchmark + demand signal row */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        {deltaPct != null && Math.abs(deltaPct) >= 1 && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 tabular',
              deltaPct < 0
                ? 'bg-positive/15 text-positive'
                : 'bg-warning/10 text-warning'
            )}
            title={`${b.avg_rent_per_sqft?.toFixed(0) ?? '—'} AED/sqft vs area median ${b.area_median_rent_psf?.toFixed(0) ?? '—'}`}
          >
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(0)}% vs area
          </span>
        )}
        {b.demand_signal && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 inline-flex items-center gap-0.5',
              b.demand_signal === 'very_high' && 'bg-positive/15 text-positive',
              b.demand_signal === 'high' && 'bg-accent/15 text-accent',
              b.demand_signal === 'moderate' && 'bg-bg-elev text-fg-muted',
              b.demand_signal === 'low' && 'bg-bg-elev text-fg-subtle'
            )}
            title={`${b.active_rent_count} active contracts`}
          >
            {b.demand_signal === 'very_high' ? '🔥' :
             b.demand_signal === 'high' ? '📈' :
             b.demand_signal === 'moderate' ? '→' : '—'}
            {' '}{b.demand_signal.replace('_', ' ')} demand
          </span>
        )}
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px]',
            b.confidence === 'high' && 'bg-positive/15 text-positive',
            b.confidence === 'medium' && 'bg-accent/15 text-accent',
            (b.confidence === 'low' || b.confidence == null) && 'bg-bg-elev text-fg-subtle'
          )}
        >
          {b.confidence ?? 'low'} confidence
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
          X-Ray
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Area searchable select (same shape as /rent-check + /brokers/directory)
// ---------------------------------------------------------------------------
function AreaSelect({
  value,
  onChange,
  options,
}: {
  value: AreaOption | null;
  onChange: (v: AreaOption | null) => void;
  options: AreaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 60);
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 80);
  }, [options, query]);

  return (
    <div className="relative">
      <label className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        Area
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-bg-card px-3 py-2.5 text-left text-sm min-h-[44px]"
      >
        <span className={cn(value ? 'text-fg' : 'text-fg-subtle', 'truncate')}>
          {value ? value.name : 'All areas'}
        </span>
        <div className="flex items-center gap-1.5">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-[11px] text-fg-subtle hover:text-fg"
            >
              clear
            </button>
          )}
          <ChevronDown
            className={cn('h-4 w-4 text-fg-subtle transition-transform', open && 'rotate-180')}
            strokeWidth={2}
          />
        </div>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-bg-card shadow-lg max-h-[60vh] overflow-hidden flex flex-col">
          <div className="relative border-b border-border">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              autoFocus
              className="w-full bg-transparent pl-9 pr-3 py-2.5 text-sm outline-none"
            />
          </div>
          <ul className="overflow-y-auto py-1">
            {filtered.map((o) => (
              <li key={o.name_norm}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-bg-elev"
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Suppress unused import warning — kept for the BuildingCard's future enhancement
void Building2;
