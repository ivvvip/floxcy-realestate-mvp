'use client';

import { useMemo, useState } from 'react';
import { compareAreas } from '@/lib/api';
import type { Area, CompareAreaData, CompareResponse } from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ComparisonRadar } from '@/components/charts/ComparisonRadar';
import { MultiLine } from '@/components/charts/MultiLine';

interface Props {
  areas: Area[];
}

export function CompareClient({ areas }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCompare = selected.length >= 2 && selected.length <= 4;

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const run = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    try {
      const result = await compareAreas(selected);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="surface-card p-5">
        <h2 className="text-sm font-medium text-fg-muted">
          Select areas ({selected.length}/4)
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {areas.map((a) => {
            const active = selected.includes(a.id);
            const disabled = !active && selected.length >= 4;
            return (
              <button
                key={a.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(a.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-accent bg-accent-muted text-accent'
                    : 'border-border bg-bg-elev text-fg-muted hover:text-fg hover:border-border-strong',
                  disabled && 'cursor-not-allowed opacity-40'
                )}
              >
                {a.name}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={!canCompare || loading}
            onClick={run}
            className="inline-flex h-10 items-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Compare'}
          </button>
          {!canCompare && (
            <span className="text-xs text-fg-subtle">
              Pick 2 to 4 areas to enable comparison
            </span>
          )}
          {error && <span className="text-xs text-warn">{error}</span>}
        </div>
      </div>

      {data && data.areas.length > 0 && (
        <>
          <MetricsTable areas={data.areas} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RadarPanel areas={data.areas} />
            <PricePanel areas={data.areas} />
          </div>
        </>
      )}
    </div>
  );
}

function MetricsTable({ areas }: { areas: CompareAreaData[] }) {
  const rows: { label: string; render: (a: CompareAreaData) => React.ReactNode }[] = [
    { label: 'Type', render: (a) => <span className="capitalize">{a.area_type}</span> },
    { label: 'Price / sqft', render: (a) => formatAED(a.latest_price_per_sqft) },
    {
      label: 'Avg sale price',
      render: (a) => formatAED(a.latest_sale_price, { compact: true }),
    },
    {
      label: 'Rental yield',
      render: (a) => (
        <span className="text-accent">{formatPercent(a.latest_yield)}</span>
      ),
    },
    { label: '1y appreciation', render: (a) => formatPercent(a.appreciation_1y ?? 0) },
    { label: '3y appreciation', render: (a) => formatPercent(a.appreciation_3y ?? 0) },
    {
      label: 'Occupancy',
      render: (a) => formatPercent(a.occupancy_rate ?? 0),
    },
    {
      label: 'Investment score',
      render: (a) => `${a.investment_score?.toFixed(1) ?? '—'}/10`,
    },
    {
      label: 'Risk score',
      render: (a) => `${a.risk_score?.toFixed(1) ?? '—'}/10`,
    },
  ];

  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-bg-elev/40 text-left text-xs uppercase tracking-wide text-fg-subtle">
          <tr>
            <th className="px-5 py-3 font-medium">Metric</th>
            {areas.map((a) => (
              <th key={a.id} className="px-5 py-3 text-right font-medium text-fg">
                {a.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border">
              <td className="px-5 py-3 text-fg-muted">{row.label}</td>
              {areas.map((a) => (
                <td key={a.id} className="px-5 py-3 text-right font-mono text-fg">
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
  // Normalize each metric to 0-10
  const metrics: { metric: string; key: keyof CompareAreaData; max: number }[] = [
    { metric: 'Yield', key: 'latest_yield', max: 10 },
    { metric: '1y Apprec', key: 'appreciation_1y', max: 15 },
    { metric: 'Investment', key: 'investment_score', max: 10 },
    { metric: 'Demand', key: 'demand_score', max: 10 },
    { metric: 'Low Risk', key: 'risk_score', max: 10 },
    { metric: 'Occupancy', key: 'occupancy_rate', max: 100 },
  ];

  const data = metrics.map((m) => {
    const point: Record<string, string | number> = { metric: m.metric };
    areas.forEach((a) => {
      let raw = (a[m.key] as number | null) ?? 0;
      if (m.key === 'risk_score') raw = 10 - raw; // invert (higher = better)
      const normalized = Math.max(0, Math.min(10, (raw / m.max) * 10));
      point[a.name] = Number(normalized.toFixed(2));
    });
    return point;
  });

  return (
    <div className="surface-card p-5">
      <h3 className="text-sm font-medium text-fg-muted">Profile comparison</h3>
      <div className="mt-4">
        <ComparisonRadar data={data} areaNames={areas.map((a) => a.name)} />
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        Each axis is normalized 0–10. &quot;Low Risk&quot; is inverted (higher = safer).
      </p>
    </div>
  );
}

function PricePanel({ areas }: { areas: CompareAreaData[] }) {
  // Build merged dataset keyed by snapshot_date
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
    <div className="surface-card p-5">
      <h3 className="text-sm font-medium text-fg-muted">
        Price / sqft over 12 months
      </h3>
      <div className="mt-4">
        <MultiLine
          data={merged}
          xKey="date"
          series={areas.map((a) => a.name)}
          yLabelFormatter={(v) => `${formatNumber(v)}`}
        />
      </div>
    </div>
  );
}
