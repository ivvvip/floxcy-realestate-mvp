'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { getDldBuildings, getDldBuildingsDerived } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { DldBuildingItem } from '@/lib/types';
import { AreaSelector } from '@/components/AreaSelector';

interface AreaOption {
  name: string;
  name_norm: string;
  occurrence_count: number;
}

interface Props {
  initialItems: DldBuildingItem[];
  initialTotal: number;
  areaOptions: AreaOption[];
  initialDerivedTotal?: number;
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

type SourceTab = 'official' | 'derived';

// Property-category tabs. Each maps to a comma-separated category set the
// /buildings-derived endpoint accepts (no value = no filter).
const CATEGORY_TABS = [
  { key: 'all',         label: 'All',         categories: ''                                     },
  { key: 'residential', label: 'Residential', categories: 'apartment,hotel_apt'                  },
  { key: 'villas',      label: 'Villas',      categories: 'villa'                                },
  { key: 'commercial',  label: 'Commercial',  categories: 'office,retail,warehouse'              },
  { key: 'special',     label: 'Special',     categories: 'labor_camp,whole_building'            },
] as const;
type CategoryTab = (typeof CATEGORY_TABS)[number]['key'];

export function BuildingsIndexClient({
  initialItems,
  initialTotal,
  areaOptions,
  initialDerivedTotal,
}: Props) {
  const searchParams = useSearchParams();
  // Tab deep links: ?tab=residential|villas|commercial|special|all.
  // ?master_project=... still works and lands on the default tab so the
  // X-Ray "Part of …" link routes correctly.
  const urlTab = (searchParams?.get('tab') ?? 'all') as CategoryTab;
  const urlMasterProject = searchParams?.get('master_project') ?? '';
  const validTab: CategoryTab = CATEGORY_TABS.some((t) => t.key === urlTab)
    ? urlTab
    : 'all';

  const [tab, setTab] = useState<CategoryTab>(validTab);
  const [items, setItems] = useState<DldBuildingItem[]>(
    validTab === 'all' && !urlMasterProject ? initialItems : [],
  );
  const [total, setTotal] = useState(
    validTab === 'all' && !urlMasterProject ? initialTotal : (initialDerivedTotal ?? 0),
  );
  const [area, setArea] = useState<AreaOption | null>(null);
  const [masterProject, setMasterProject] = useState(urlMasterProject);
  const [qSearch, setQSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCategorySet = useMemo(
    () => CATEGORY_TABS.find((t) => t.key === tab)?.categories ?? '',
    [tab],
  );

  // Skip the initial fetch when we landed on the default "All" tab with no
  // deep-link filter — the SSR pre-filled the derived list already.
  const [hydrated, setHydrated] = useState(
    validTab === 'all' && !urlMasterProject,
  );

  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      // fall through — fetch
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getDldBuildingsDerived({
          area: area?.name_norm,
          category: activeCategorySet || undefined,
          master_project: masterProject.trim() || undefined,
          q: qSearch.trim() || undefined,
          page: page + 1,
          page_size: PAGE_SIZE,
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
  }, [activeCategorySet, area, masterProject, qSearch, page]);

  useEffect(() => {
    setPage(0);
  }, [activeCategorySet, area, masterProject, qSearch]);

  const showFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min(total, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Property-category tabs. Every tab filters the synthetic dim built
          from the Ejari rent stream (dld_buildings_derived). The official
          47-row dim is still reachable via direct /buildings/{id} URLs and
          via /areas/[id]/top-buildings. */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === t.key
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-subtle hover:text-fg'
            )}
            aria-pressed={tab === t.key}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-fg-subtle pb-2 pr-1 whitespace-nowrap">
          Built from Ejari rent contracts 2021–2026.
        </span>
      </div>

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
        <AreaSelector value={area} onChange={setArea} options={areaOptions} />
        <div>
          <label
            htmlFor="b_master"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Master project
          </label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              id="b_master"
              type="search"
              value={masterProject}
              onChange={(e) => setMasterProject(e.target.value)}
              placeholder="e.g. Dubai Land Residence Complex"
              className="input-field pl-9 min-h-[44px]"
            />
          </div>
        </div>
        <div className="flex items-end pb-2 text-[11px] text-fg-subtle">
          Sorted by{' '}
          <span className="ml-1 font-medium text-fg">contract count</span>
          <span className="ml-1">(most active first)</span>
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
            {b.data_source === 'ejari_derived' && (
              <span
                className="ml-1 rounded bg-accent/15 px-1 text-accent"
                title="Identity inferred from the Ejari rent registry"
              >
                · Ejari Verified ✅
              </span>
            )}
            {b.data_source === 'dld_official' && (
              <span
                className="ml-1 rounded bg-positive/15 px-1 text-positive"
                title="Registered in the official DLD buildings dataset"
              >
                · DLD Official ✅
              </span>
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

// Suppress unused import warning — kept for the BuildingCard's future enhancement
void Building2;
