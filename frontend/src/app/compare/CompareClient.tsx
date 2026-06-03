'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { compareAreas } from '@/lib/api';
import type { Area, CompareAreaData, CompareResponse } from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ComparisonRadar } from '@/components/charts/ComparisonRadar';
import { MultiLine } from '@/components/charts/MultiLine';
import { FilterChip } from '@/components/data/FilterChip';
import { MetricTooltip } from '@/components/MetricTooltip';
import { DataBadge } from '@/components/data/DataBadge';
import { CompareInsights } from './CompareInsights';

interface Props {
  areas: Area[];
}

type Tab = 'overlay' | 'metrics' | 'radar';

export function CompareClient({ areas }: Props) {
  const search = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('overlay');

  useEffect(() => {
    const ids = search?.get('ids')?.split(',').filter(Boolean) ?? [];
    if (ids.length) setSelected(ids.slice(0, 4));
  }, [search]);

  const canCompare = selected.length >= 2 && selected.length <= 4;
  const areasById = new Map(areas.map((a) => [a.id, a]));

  const add = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id) || prev.length >= 4) return prev;
      return [...prev, id];
    });
    setPickerOpen(false);
  };

  const remove = (id: string) => {
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  useEffect(() => {
    if (!canCompare) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    compareAreas(selected)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Comparison failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, canCompare]);

  const filteredAreas = areas.filter(
    (a) =>
      !selected.includes(a.id) &&
      a.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Selector strip */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label">
            Selected areas · <span className="tabular text-fg-muted">{selected.length}/4</span>
          </span>
          {loading && (
            <span className="text-[11px] text-fg-subtle tabular">Loading…</span>
          )}
          {error && (
            <span className="text-[11px] text-negative">{error}</span>
          )}
        </div>
        <div className="p-3 flex items-center gap-2 flex-wrap relative">
          {selected.map((id) => {
            const a = areasById.get(id);
            if (!a) return null;
            return (
              <FilterChip
                key={id}
                label={a.name}
                active
                onDismiss={() => remove(id)}
              />
            );
          })}
          {selected.length < 4 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-bg-elev/40 px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Add area
              </button>
              {pickerOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-72 border border-border rounded-md bg-bg-card shadow-card">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle" strokeWidth={2} />
                      <input
                        autoFocus
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Search areas…"
                        className="w-full bg-bg-elev/60 border border-border rounded-md pl-7 pr-2 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
                      />
                    </div>
                  </div>
                  <ul className="max-h-72 overflow-y-auto scrollbar-thin py-1">
                    {filteredAreas.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-fg-subtle">No matches</li>
                    ) : (
                      filteredAreas.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => add(a.id)}
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-bg-elev/60 flex items-center justify-between"
                          >
                            <span className="text-fg">{a.name}</span>
                            <span className="pill">{a.area_type}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
          {selected.length === 0 && (
            <span className="text-xs text-fg-subtle">
              Add 2–4 areas to compare side by side
            </span>
          )}
        </div>
      </div>

      {data && data.areas.length > 0 && (
        <>
          {/* CompareInsights: winner table + AED 1M simulator + AI verdict + share */}
          <CompareInsights areas={data.areas} />

          <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
            <div className="border-b border-border flex items-center text-xs">
              {(['overlay', 'metrics', 'radar'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-4 py-3 font-medium border-b-2 capitalize transition-colors',
                    tab === t
                      ? 'border-accent text-fg'
                      : 'border-transparent text-fg-muted hover:text-fg'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'overlay' && <PriceOverlay areas={data.areas} />}
              {tab === 'metrics' && <MetricsTable areas={data.areas} />}
              {tab === 'radar' && <RadarPanel areas={data.areas} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricsTable({ areas }: { areas: CompareAreaData[] }) {
  const rows: {
    label: string;
    tooltip?: string;
    render: (a: CompareAreaData) => React.ReactNode;
  }[] = [
    { label: 'Type', render: (a) => <span className="pill">{a.area_type}</span> },
    {
      label: 'AED / sqft',
      render: (a) =>
        a.latest_price_per_sqft != null
          ? formatNumber(a.latest_price_per_sqft, 0)
          : '—',
    },
    {
      label: 'Avg sale price',
      render: (a) =>
        a.latest_sale_price != null
          ? formatAED(a.latest_sale_price, { compact: true })
          : '—',
    },
    {
      label: 'Yield',
      tooltip: 'Gross Yield',
      render: (a) =>
        a.latest_yield != null ? formatPercent(a.latest_yield, 2) : '—',
    },
    {
      label: '1Y appreciation',
      tooltip: '5Y Appreciation',
      render: (a) => <DataBadge value={a.appreciation_1y} format="percent" />,
    },
    {
      label: '3Y appreciation',
      tooltip: '5Y Appreciation',
      render: (a) => <DataBadge value={a.appreciation_3y} format="percent" />,
    },
    {
      label: 'Occupancy',
      tooltip: 'Occupancy Rate',
      render: (a) =>
        a.occupancy_rate != null ? formatPercent(a.occupancy_rate) : '—',
    },
    {
      label: 'Demand score',
      render: (a) =>
        a.demand_score != null ? `${a.demand_score.toFixed(1)}/10` : '—',
    },
    {
      label: 'Risk score',
      tooltip: 'Supply Risk',
      render: (a) =>
        a.risk_score != null ? `${a.risk_score.toFixed(1)}/10` : '—',
    },
    {
      label: 'Investment score',
      render: (a) =>
        a.investment_score != null
          ? `${a.investment_score.toFixed(1)}/10`
          : '—',
    },
  ];

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="data-table">
        <thead>
          <tr>
            <th>Metric</th>
            {areas.map((a) => (
              <th key={a.id} className="text-right text-fg">
                {a.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="text-fg-muted">
                <span className="inline-flex items-center">
                  {row.label}
                  {row.tooltip && <MetricTooltip metric={row.tooltip} />}
                </span>
              </td>
              {areas.map((a) => (
                <td key={a.id} className="num">
                  {row.render(a)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RadarPanel({ areas }: { areas: CompareAreaData[] }) {
  const metrics: { metric: string; key: keyof CompareAreaData; max: number }[] = [
    { metric: 'Yield', key: 'latest_yield', max: 10 },
    { metric: '1y App', key: 'appreciation_1y', max: 15 },
    { metric: 'Investment', key: 'investment_score', max: 10 },
    { metric: 'Demand', key: 'demand_score', max: 10 },
    { metric: 'Low Risk', key: 'risk_score', max: 10 },
    { metric: 'Occupancy', key: 'occupancy_rate', max: 100 },
  ];

  const data = metrics.map((m) => {
    const point: Record<string, string | number> = { metric: m.metric };
    areas.forEach((a) => {
      let raw = (a[m.key] as number | null) ?? 0;
      if (m.key === 'risk_score') raw = 10 - raw;
      const normalized = Math.max(0, Math.min(10, (raw / m.max) * 10));
      point[a.name] = Number(normalized.toFixed(2));
    });
    return point;
  });

  return (
    <div>
      <ComparisonRadar data={data} areaNames={areas.map((a) => a.name)} height={400} />
      <p className="mt-2 text-[11px] text-fg-subtle text-center">
        Axes normalized 0–10. &quot;Low Risk&quot; inverted (higher = safer).
      </p>
    </div>
  );
}

function PriceOverlay({ areas }: { areas: CompareAreaData[] }) {
  const dates = areas[0]?.history.map((h) => h.snapshot_date) ?? [];
  const merged = dates.map((d) => {
    const point: Record<string, string | number> = { date: d.slice(0, 7) };
    areas.forEach((a) => {
      const hit = a.history.find((h) => h.snapshot_date === d);
      point[a.name] = hit ? hit.avg_price_per_sqft : 0;
    });
    return point;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
      <div>
        <MultiLine
          data={merged}
          xKey="date"
          series={areas.map((a) => a.name)}
          yLabelFormatter={(v) => formatNumber(v)}
          height={360}
        />
      </div>
      <div className="border-l-0 lg:border-l border-border lg:pl-4">
        <div className="chart-header-label mb-3">Latest snapshot</div>
        <div className="space-y-3">
          {areas.map((a) => {
            const first = a.history[0]?.avg_price_per_sqft;
            const last = a.history[a.history.length - 1]?.avg_price_per_sqft;
            const delta = first && last ? ((last - first) / first) * 100 : null;
            return (
              <div
                key={a.id}
                className="flex items-center justify-between text-xs"
              >
                <div className="min-w-0">
                  <div className="text-fg truncate">{a.name}</div>
                  <div className="tabular text-fg-subtle">
                    {a.latest_price_per_sqft != null
                      ? `${formatNumber(a.latest_price_per_sqft, 0)} AED/sqft`
                      : 'Limited data'}
                  </div>
                </div>
                <DataBadge value={delta} format="percent" precision={1} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
