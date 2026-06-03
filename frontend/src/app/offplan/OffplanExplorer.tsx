'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Filter as FilterIcon } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { OffplanProjectCard, DeveloperCard, OffplanStatusKey } from '@/lib/types';

interface Props {
  initialProjects: OffplanProjectCard[];
  developers: DeveloperCard[];
  dataSource: string;
  counts: Record<string, number>;
}

type SortKey = 'units' | 'newest' | 'oldest' | 'name';
type StatusTab = OffplanStatusKey | 'all';

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'active',      label: 'Under Construction' },
  { key: 'completed',   label: 'Completed' },
  { key: 'coming_soon', label: 'Coming Soon' },
  { key: 'all',         label: 'All' },
];

export function OffplanExplorer({ initialProjects, developers, dataSource, counts }: Props) {
  const [devFilter, setDevFilter] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('units');
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('active');

  const filtered = useMemo(() => {
    let rows = initialProjects;
    if (statusTab !== 'all') rows = rows.filter((p) => p.status_key === statusTab);
    if (devFilter) rows = rows.filter((p) => p.developer_slug === devFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.master_project.toLowerCase().includes(q) ||
          (p.area_name ?? '').toLowerCase().includes(q) ||
          p.developer_name.toLowerCase().includes(q)
      );
    }
    const out = [...rows];
    out.sort((a, b) => {
      if (sort === 'units') return b.total_units - a.total_units;
      if (sort === 'newest') return (b.latest_year ?? 0) - (a.latest_year ?? 0);
      if (sort === 'oldest') return (a.earliest_year ?? 9999) - (b.earliest_year ?? 9999);
      return a.master_project.localeCompare(b.master_project);
    });
    return out;
  }, [initialProjects, devFilter, sort, search, statusTab]);

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-border pb-2">
        {STATUS_TABS.map((t) => {
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                statusTab === t.key
                  ? 'bg-accent text-bg'
                  : 'text-fg-muted hover:text-fg hover:bg-bg-elev/40'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'tabular text-[10px]',
                  statusTab === t.key ? 'text-bg/70' : 'text-fg-subtle'
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="surface-card p-3 flex flex-wrap items-center gap-2">
        <FilterIcon className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={2} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects, areas, developers…"
          className="flex-1 min-w-[180px] bg-bg-elev/60 border border-border rounded-md px-3 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        />
        <select
          value={devFilter}
          onChange={(e) => setDevFilter(e.target.value)}
          className="bg-bg-elev/60 border border-border rounded-md px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent/60"
        >
          <option value="">All developers</option>
          {developers.map((d) => (
            <option key={d.slug} value={d.slug}>{d.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-bg-elev/60 border border-border rounded-md px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent/60"
        >
          <option value="units">Most units</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">A → Z</option>
        </select>
        <span className="ml-auto text-[11px] text-fg-subtle tabular">
          {filtered.length} of {initialProjects.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card p-6 text-center text-fg-muted text-sm">
          No matching projects.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.slug} p={p} />
          ))}
        </div>
      )}

      {dataSource && (
        <p className="text-[11px] text-fg-subtle italic">{dataSource}</p>
      )}
    </div>
  );
}

function statusEmoji(s: OffplanStatusKey): string {
  if (s === 'completed') return '✅';
  if (s === 'coming_soon') return '📋';
  return '🏗️';
}

function statusPillClass(s: OffplanStatusKey): string {
  if (s === 'completed') return 'border-positive/40 text-positive bg-positive/5';
  if (s === 'coming_soon') return 'border-accent/40 text-accent bg-accent/5';
  return 'pill-accent';
}

function ProjectCard({ p }: { p: OffplanProjectCard }) {
  return (
    <Link
      href={`/offplan/${p.slug}`}
      className="surface-card p-4 hover:border-accent/40 transition-colors block group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg group-hover:text-accent truncate">
            {p.master_project}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted truncate">
            {p.area_name ?? '—'} · {p.developer_name}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex items-center gap-1 text-[10px] tabular border rounded px-1.5 py-0.5',
            statusPillClass(p.status_key)
          )}
          title={p.status_label}
        >
          {statusEmoji(p.status_key)}{' '}
          {p.status_key === 'completed'
            ? 'Completed'
            : p.status_key === 'coming_soon'
            ? 'Coming Soon'
            : 'Under construction'}
        </span>
      </div>

      <div className="mt-2 text-[11px] text-fg-muted">{p.status_label}</div>

      {p.status_key === 'completed' && p.price_gain_pct != null && p.offplan_ppsf && p.ready_ppsf && (
        <div className="mt-2 rounded border border-positive/30 bg-positive/5 px-2 py-1.5 text-[11px] tabular text-positive">
          Bought off-plan at {formatNumber(p.offplan_ppsf, 0)} AED/sqft → ready market {formatNumber(p.ready_ppsf, 0)} AED/sqft
          <span className="ml-1 font-semibold">
            {p.price_gain_pct >= 0 ? '+' : ''}{p.price_gain_pct.toFixed(1)}%
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Buildings" value={formatNumber(p.buildings_count)} />
        <Stat label="Units" value={formatNumber(p.total_units)} accent />
        <Stat
          label="Years"
          value={
            p.earliest_year && p.latest_year
              ? p.earliest_year === p.latest_year
                ? `${p.earliest_year}`
                : `${p.earliest_year}–${p.latest_year}`
              : '—'
          }
        />
      </div>

      <div className="mt-3 flex items-center gap-1 text-[11px] text-accent">
        {p.status_key === 'completed' ? 'See ready market' : 'View details'}{' '}
        <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
      </div>
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-fg-subtle uppercase tracking-wide">{label}</div>
      <div className={`tabular font-medium ${accent ? 'text-accent' : 'text-fg'}`}>{value}</div>
    </div>
  );
}
