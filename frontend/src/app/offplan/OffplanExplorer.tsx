'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Filter as FilterIcon, ShieldCheck, BadgeCheck } from 'lucide-react';
import { formatNumber, formatLargeAED } from '@/lib/format';
import { cn } from '@/lib/cn';
import { completionStage, statusPill, formatHandover } from '@/lib/offplanOfficial';
import type { OfficialProjectCard } from '@/lib/types';

interface Props {
  projects: OfficialProjectCard[];
}

type SortKey = 'completion' | 'value' | 'units' | 'handover' | 'name';
type StatusTab = 'ACTIVE' | 'PENDING' | 'all';

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'ACTIVE',  label: 'Active' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'all',     label: 'All' },
];

// Construction-stage filter buckets (by percent_completed).
const STAGE_BUCKETS: { key: string; label: string; test: (p: number | null) => boolean }[] = [
  { key: 'all',      label: 'Any stage',        test: () => true },
  { key: 'launched', label: '📋 Just Launched',  test: (p) => p === 0 },
  { key: 'early',    label: '🏗️ Early (1–25%)',  test: (p) => p != null && p > 0 && p < 25 },
  { key: 'under',    label: '🏗️ Under (25–50%)', test: (p) => p != null && p >= 25 && p < 50 },
  { key: 'mid',      label: '🔨 Mid (50–75%)',    test: (p) => p != null && p >= 50 && p < 75 },
  { key: 'near',     label: '🔨 Near (75–99%)',   test: (p) => p != null && p >= 75 && p < 100 },
];

export function OffplanExplorer({ projects }: Props) {
  const [statusTab, setStatusTab] = useState<StatusTab>('ACTIVE');
  const [devFilter, setDevFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('completion');
  const [search, setSearch] = useState('');

  const developers = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) {
      if (p.developer_number && p.developer_name) m.set(p.developer_number, p.developer_name);
    }
    return [...m.entries()].map(([number, name]) => ({ number, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const areas = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) {
      if (p.area_name_norm && p.area) m.set(p.area_name_norm, p.area);
    }
    return [...m.entries()].map(([norm, name]) => ({ norm, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const counts = useMemo(() => {
    const c = { ACTIVE: 0, PENDING: 0, all: projects.length } as Record<string, number>;
    for (const p of projects) {
      const s = (p.project_status || '').toUpperCase();
      if (s === 'ACTIVE') c.ACTIVE++;
      else if (s.startsWith('PENDING')) c.PENDING++;
    }
    return c;
  }, [projects]);

  const stageTest = STAGE_BUCKETS.find((b) => b.key === stageFilter)?.test ?? (() => true);

  const filtered = useMemo(() => {
    let rows = projects;
    if (statusTab !== 'all') {
      rows = rows.filter((p) =>
        statusTab === 'ACTIVE'
          ? (p.project_status || '').toUpperCase() === 'ACTIVE'
          : (p.project_status || '').toUpperCase().startsWith('PENDING')
      );
    }
    if (devFilter) rows = rows.filter((p) => p.developer_number === devFilter);
    if (areaFilter) rows = rows.filter((p) => p.area_name_norm === areaFilter);
    rows = rows.filter((p) => stageTest(p.percent_completed));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          (p.project_name ?? '').toLowerCase().includes(q) ||
          (p.area ?? '').toLowerCase().includes(q) ||
          (p.developer_name ?? '').toLowerCase().includes(q)
      );
    }
    const out = [...rows];
    out.sort((a, b) => {
      if (sort === 'completion') return (b.percent_completed ?? -1) - (a.percent_completed ?? -1);
      if (sort === 'value') return (b.project_value_aed ?? 0) - (a.project_value_aed ?? 0);
      if (sort === 'units') return (b.unit_count ?? 0) - (a.unit_count ?? 0);
      if (sort === 'handover') return (a.expected_handover ?? '9999').localeCompare(b.expected_handover ?? '9999');
      return (a.project_name ?? '').localeCompare(b.project_name ?? '');
    });
    return out;
  }, [projects, statusTab, devFilter, areaFilter, stageTest, search, sort]);

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-border pb-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatusTab(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              statusTab === t.key ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg hover:bg-bg-elev/40'
            )}
          >
            {t.label}
            <span className={cn('tabular text-[10px]', statusTab === t.key ? 'text-bg/70' : 'text-fg-subtle')}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
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
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="bg-bg-elev/60 border border-border rounded-md px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent/60"
        >
          <option value="">All areas</option>
          {areas.map((a) => <option key={a.norm} value={a.norm}>{a.name}</option>)}
        </select>
        <select
          value={devFilter}
          onChange={(e) => setDevFilter(e.target.value)}
          className="bg-bg-elev/60 border border-border rounded-md px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent/60"
        >
          <option value="">All developers</option>
          {developers.map((d) => <option key={d.number} value={d.number}>{d.name}</option>)}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="bg-bg-elev/60 border border-border rounded-md px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent/60"
        >
          {STAGE_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-bg-elev/60 border border-border rounded-md px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent/60"
        >
          <option value="completion">Most complete</option>
          <option value="value">Project value</option>
          <option value="units">Most units</option>
          <option value="handover">Soonest handover</option>
          <option value="name">A → Z</option>
        </select>
        <span className="ml-auto text-[11px] text-fg-subtle tabular">
          {filtered.length} of {projects.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card p-6 text-center text-fg-muted text-sm">No matching projects.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <ProjectCard key={p.project_number} p={p} />)}
        </div>
      )}

      <p className="text-[11px] text-fg-subtle italic">
        ✅ Official DLD Data — Dubai Land Department projects registry (2026 snapshot).
      </p>
    </div>
  );
}

function ProjectCard({ p }: { p: OfficialProjectCard }) {
  const stage = completionStage(p.percent_completed);
  const pill = statusPill(p.project_status);
  const handover = formatHandover(p.expected_handover);
  const pct = p.percent_completed ?? 0;

  return (
    <Link
      href={`/offplan/${p.project_number}`}
      className="surface-card p-4 hover:border-accent/40 transition-colors block group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg group-hover:text-accent truncate">
            {p.project_name ?? `Project ${p.project_number}`}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-muted truncate">
            <BadgeCheck className="h-3 w-3 text-positive shrink-0" strokeWidth={2.5} />
            <span className="truncate">{p.developer_name ?? '—'}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-fg-subtle truncate">{p.area ?? '—'}</div>
        </div>
        <span className={cn('shrink-0 inline-flex items-center text-[10px] tabular border rounded px-1.5 py-0.5', pill.className)}>
          {pill.label}
        </span>
      </div>

      {/* Construction stage + % bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className={cn('font-medium', stage.tone)}>{stage.emoji} {stage.label}</span>
          <span className="tabular text-fg-muted">{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-bg-elev overflow-hidden">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Units" value={p.unit_count != null ? formatNumber(p.unit_count) : '—'} accent />
        <Stat label="Handover" value={handover ?? '—'} />
        <Stat label="Value" value={p.project_value_aed != null ? formatLargeAED(p.project_value_aed) : '—'} />
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {p.has_escrow && (
          <span className="inline-flex items-center gap-1 text-[10px] text-positive border border-positive/30 bg-positive/5 rounded px-1.5 py-0.5">
            <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Escrow Protected
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent">
          View details <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
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
