'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Home,
  Landmark,
  Search,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {
  getDldBuildingsDerived,
  getDldCommunities,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import type { DldBuildingItem, DldCommunityItem } from '@/lib/types';
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
}

const PAGE_SIZE = 24;

// 4-tab property intelligence: each tab is a different experience.
const TABS = [
  {
    key: 'buildings',
    label: 'Buildings',
    emoji: '🏢',
    icon: Building2,
    title: 'Building X-Ray',
    blurb: 'Towers and apartment buildings — annual income, yield, occupancy.',
    categories: 'apartment,hotel_apt',
  },
  {
    key: 'villas',
    label: 'Villas',
    emoji: '🏡',
    icon: Home,
    title: 'Villa Intelligence',
    blurb: 'Individual villas and villa compounds — annual rent, size, community.',
    categories: 'villa',
  },
  {
    key: 'communities',
    label: 'Communities',
    emoji: '🏘️',
    icon: Landmark,
    title: 'Community Overview',
    blurb: 'Master-planned communities aggregated across all towers and villas inside them.',
    categories: '',
  },
  {
    key: 'commercial',
    label: 'Commercial',
    emoji: '🏬',
    icon: Store,
    title: 'Commercial Properties',
    blurb: 'Offices, shops, warehouses — commercial rent benchmarks.',
    categories: 'office,retail,warehouse,labor_camp,whole_building',
  },
] as const;
type TabKey = (typeof TABS)[number]['key'];

// Legacy tab keys still appear in /areas/[id] deep-links and in older
// session URLs; remap them to the new 4-tab world.
const LEGACY_TAB_MAP: Record<string, TabKey> = {
  all: 'buildings',
  residential: 'buildings',
  apartments: 'buildings',
  villas: 'villas',
  commercial: 'commercial',
  special: 'commercial',
};

function resolveTab(raw: string | null): TabKey {
  if (!raw) return 'buildings';
  if (TABS.some((t) => t.key === raw)) return raw as TabKey;
  return LEGACY_TAB_MAP[raw] ?? 'buildings';
}

export function BuildingsIndexClient({
  initialItems,
  initialTotal,
  areaOptions,
}: Props) {
  const searchParams = useSearchParams();
  const urlTab = resolveTab(searchParams?.get('tab') ?? null);
  const urlMasterProject = searchParams?.get('master_project') ?? '';
  const urlArea = searchParams?.get('area') ?? '';
  const initialArea = useMemo(
    () =>
      urlArea
        ? areaOptions.find((a) => a.name_norm === urlArea.toLowerCase()) ?? null
        : null,
    [urlArea, areaOptions]
  );

  const [tab, setTab] = useState<TabKey>(urlTab);
  const [items, setItems] = useState<DldBuildingItem[]>(
    urlTab === 'buildings' && !urlMasterProject && !initialArea
      ? initialItems
      : []
  );
  const [communities, setCommunities] = useState<DldCommunityItem[]>([]);
  const [total, setTotal] = useState(
    urlTab === 'buildings' && !urlMasterProject && !initialArea
      ? initialTotal
      : 0
  );
  const [area, setArea] = useState<AreaOption | null>(initialArea);
  const [masterProject, setMasterProject] = useState(urlMasterProject);
  const [qSearch, setQSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTab = useMemo(
    () => TABS.find((t) => t.key === tab) ?? TABS[0],
    [tab]
  );

  // Skip the initial fetch when SSR pre-filled the Buildings tab.
  const [hydrated, setHydrated] = useState(
    urlTab === 'buildings' && !urlMasterProject && !initialArea
  );

  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (tab === 'communities') {
          const res = await getDldCommunities({
            area: area?.name_norm,
            q: qSearch.trim() || masterProject.trim() || undefined,
            page: page + 1,
            page_size: PAGE_SIZE,
          });
          setCommunities(res.items);
          setItems([]);
          setTotal(res.total_available);
        } else {
          const res = await getDldBuildingsDerived({
            area: area?.name_norm,
            category: activeTab.categories || undefined,
            master_project: masterProject.trim() || undefined,
            q: qSearch.trim() || undefined,
            page: page + 1,
            page_size: PAGE_SIZE,
          });
          setItems(res.items);
          setCommunities([]);
          setTotal(res.total_available);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load properties.');
        setItems([]);
        setCommunities([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, area, masterProject, qSearch, page]);

  useEffect(() => {
    setPage(0);
  }, [tab, area, masterProject, qSearch]);

  const showFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min(total, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* 4-tab property-type switcher. Each tab swaps title, blurb, dataset
          and card shape so users get a coherent experience per property
          class — apartments shouldn't render as villa cards and vice-versa. */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px',
                tab === t.key
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-subtle hover:text-fg'
              )}
              aria-pressed={tab === t.key}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-fg-subtle pb-2 pr-1 whitespace-nowrap">
          Built from Ejari rent contracts 2021–2026.
        </span>
      </div>

      {/* Per-tab title + blurb. Sets expectations before the user reads any
          numbers — apartment buildings, villas, communities and commercial
          all need different framing. */}
      <section className="card px-4 py-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-xl leading-none">{activeTab.emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg">{activeTab.title}</div>
            <p className="mt-0.5 text-[11px] text-fg-muted">{activeTab.blurb}</p>
          </div>
        </div>
      </section>

      {/* Cross-search — searches project_name + master_project + area */}
      <section className="card p-3 sm:p-4">
        <label
          htmlFor="b_q"
          className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
        >
          {tab === 'communities'
            ? 'Search communities'
            : 'Search across building · community · area'}
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
            placeholder={
              tab === 'communities'
                ? 'e.g. DAMAC Hills, JVC, Dubai Marina…'
                : tab === 'villas'
                  ? 'e.g. Arabian Ranches, Al Furjan…'
                  : tab === 'commercial'
                    ? 'e.g. Business Bay, DIFC…'
                    : 'e.g. Damac, Marsa Dubai, Burj Khalifa…'
            }
            className="input-field pl-10 min-h-[44px] text-sm"
          />
        </div>
      </section>

      {/* Filter bar — area picker + master-project filter (master-project is
          hidden in Communities tab because that IS the row identity). */}
      <section className="card p-4 sm:p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AreaSelector value={area} onChange={setArea} options={areaOptions} />
        {tab !== 'communities' && (
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
        )}
        <div className="flex items-end pb-2 text-[11px] text-fg-subtle">
          Sorted by{' '}
          <span className="ml-1 font-medium text-fg">
            {tab === 'communities' ? 'contract volume' : 'contract count'}
          </span>
          <span className="ml-1">(most active first)</span>
        </div>
      </section>

      {/* Count line */}
      <div className="flex items-center justify-between text-[11px] text-fg-subtle px-1">
        <span>
          {loading
            ? 'Loading…'
            : total === 0
              ? tab === 'communities'
                ? 'No communities match'
                : 'No properties match'
              : `${showFrom.toLocaleString()}–${showTo.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        {error && <span className="text-negative">{error}</span>}
      </div>

      {/* Cards grid — different shape per tab */}
      {tab === 'communities' ? (
        communities.length === 0 && !loading ? (
          <div className="card p-8 text-center text-sm text-fg-subtle">
            No communities match these filters. Try a different area or clear the
            search.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {communities.map((c) => (
              <CommunityCard key={c.slug} c={c} />
            ))}
          </div>
        )
      ) : items.length === 0 && !loading ? (
        <div className="card p-8 text-center text-sm text-fg-subtle">
          No properties match these filters. Try a different area or clear the
          project search.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) =>
            tab === 'villas' ? (
              <VillaCard key={b.id} b={b} />
            ) : tab === 'commercial' ? (
              <CommercialCard key={b.id} b={b} />
            ) : (
              <BuildingCard key={b.id} b={b} />
            )
          )}
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
        protect tenant-level economics.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building card — apartments / towers
// ---------------------------------------------------------------------------

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
          <div className="mb-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev/50 px-2 py-0.5 text-[10px] text-fg-muted">
              🏢 Tower
            </span>
          </div>
          <div
            className="text-sm font-semibold text-fg truncate"
            title={b.display_name ?? b.project_name ?? ''}
          >
            {b.display_name ?? b.project_name ?? '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted truncate">
            {b.area_name ?? '—'}
            {b.prop_sub_type ? ` · ${b.prop_sub_type}` : ''}
            {b.data_source === 'ejari_derived' && (
              <span className="ml-1 rounded bg-accent/15 px-1 text-accent">
                · Ejari ✅
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
            Annual income
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

      {deltaPct != null && Math.abs(deltaPct) >= 1 && (
        <div className="mt-2 text-[10px]">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 tabular',
              deltaPct < 0
                ? 'bg-positive/15 text-positive'
                : 'bg-warning/10 text-warning'
            )}
          >
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(0)}% vs area
          </span>
        </div>
      )}

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
// Villa card — house icon, focuses on rent / community
// ---------------------------------------------------------------------------

function VillaCard({ b }: { b: DldBuildingItem }) {
  return (
    <Link
      href={`/buildings/${b.id}`}
      className="card p-4 flex flex-col hover:border-accent/40 transition-colors min-h-[180px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
              🏡 Villa
            </span>
          </div>
          <div
            className="text-sm font-semibold text-fg truncate"
            title={b.display_name ?? b.project_name ?? ''}
          >
            {b.display_name ?? b.project_name ?? '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted truncate">
            📍 {b.area_name ?? '—'}
          </div>
          {b.master_project && (
            <div className="mt-0.5 text-[11px] text-fg-subtle truncate">
              🏘️ {b.master_project}
            </div>
          )}
        </div>
        {b.is_freehold === true && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded bg-positive/15 px-1.5 py-0.5 text-[10px] text-positive">
            <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Freehold
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Annual rent
          </div>
          <div className="mt-0.5 text-fg font-medium truncate">
            {b.avg_annual_rent != null
              ? `AED ${(b.avg_annual_rent / 1000).toFixed(0)}k`
              : '—'}
          </div>
        </div>
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Active leases
          </div>
          <div className="mt-0.5 text-fg font-mono">
            {b.active_rent_count.toLocaleString()}
          </div>
        </div>
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
          Villa profile
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Commercial card — store icon, commercial rent framing
// ---------------------------------------------------------------------------

function CommercialCard({ b }: { b: DldBuildingItem }) {
  const labelByCategory: Record<string, { emoji: string; label: string }> = {
    office: { emoji: '🏢', label: 'Office' },
    retail: { emoji: '🛒', label: 'Retail' },
    warehouse: { emoji: '🏭', label: 'Warehouse' },
    labor_camp: { emoji: '👷', label: 'Labor camp' },
    whole_building: { emoji: '🏗️', label: 'Whole building' },
  };
  const meta =
    (b.property_category && labelByCategory[b.property_category]) ||
    { emoji: '🏬', label: 'Commercial' };

  return (
    <Link
      href={`/buildings/${b.id}`}
      className="card p-4 flex flex-col hover:border-accent/40 transition-colors min-h-[180px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
              {meta.emoji} {meta.label}
            </span>
          </div>
          <div
            className="text-sm font-semibold text-fg truncate"
            title={b.display_name ?? b.project_name ?? ''}
          >
            {b.display_name ?? b.project_name ?? '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted truncate">
            {b.area_name ?? '—'}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Annual rent (avg)
          </div>
          <div className="mt-0.5 text-fg font-medium truncate">
            {b.avg_annual_rent != null
              ? `AED ${(b.avg_annual_rent / 1000).toFixed(0)}k`
              : '—'}
          </div>
        </div>
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Active contracts
          </div>
          <div className="mt-0.5 text-fg font-mono">
            {b.active_rent_count.toLocaleString()}
          </div>
        </div>
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
          Open
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Community card — Landmark icon, aggregated metrics
// ---------------------------------------------------------------------------

function CommunityCard({ c }: { c: DldCommunityItem }) {
  return (
    <Link
      href={`/buildings?tab=buildings&master_project=${encodeURIComponent(c.master_project)}`}
      className="card p-4 flex flex-col hover:border-accent/40 transition-colors min-h-[180px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
              🏘️ Community
            </span>
          </div>
          <div
            className="text-sm font-semibold text-fg truncate"
            title={c.master_project}
          >
            {c.master_project}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted truncate">
            📍 {c.primary_area_name ?? '—'}
            {c.area_count > 1 && (
              <span className="text-fg-subtle">
                {' '}· {c.area_count} areas
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Buildings
          </div>
          <div className="mt-0.5 text-fg font-mono">
            {c.building_count.toLocaleString()}
          </div>
        </div>
        <div className="rounded border border-border bg-bg-elev px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Active leases
          </div>
          <div className="mt-0.5 text-fg font-mono">
            {c.total_contracts.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-2 rounded border border-border bg-bg-elev px-2 py-1.5 text-[11px]">
        <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
          Aggregate income
        </div>
        <div className="mt-0.5 text-fg font-medium truncate">
          {c.income_range_label ?? '—'}
        </div>
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px]',
            c.confidence === 'high' && 'bg-positive/15 text-positive',
            c.confidence === 'medium' && 'bg-accent/15 text-accent',
            (c.confidence === 'low' || c.confidence == null) && 'bg-bg-elev text-fg-subtle'
          )}
        >
          {c.confidence ?? 'low'} confidence
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
          Explore
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}
