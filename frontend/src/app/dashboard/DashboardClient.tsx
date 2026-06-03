'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ActivitySquare, ArrowDownRight, ArrowRight, ArrowUpRight, Building2,
  CircleDollarSign, Database, Flame, Gauge, LayoutDashboard, LineChart as LineIcon,
  Sparkles, TrendingUp, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  AXIS_COLOR, GRID_COLOR, TOOLTIP_STYLE,
} from '@/components/charts/ChartTheme';
import { formatAED, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MetricTooltip, type MetricKey } from '@/components/MetricTooltip';
import { toAreaSlug } from '@/lib/slugs';

// Maps a backend KPI/section label to a tooltip entry. KPI tile labels match
// the Dubai-wide dashboard entries; section titles fall through to the
// per-area metric vocabulary.
function tooltipForLabel(label: string): MetricKey | null {
  const l = label.toLowerCase();
  // KPI tiles (Dubai-wide totals)
  if (l.includes('off-plan share') || l.includes('offplan share')) return 'Off-Plan Share';
  if (l.includes('avg yield')) return 'Avg Yield';
  if (l.includes('rent contracts')) return 'Rent Contracts';
  if (l.includes('rera')) return 'Active RERA Brokers';
  if (l.includes('sales volume')) return 'Sales Volume';
  if (l.startsWith('sales ') || l === 'sales') return 'Sales YTD';
  // Section titles (per-area)
  if (l.includes('off-plan') || l.includes('offplan')) return 'Off-Plan %';
  if (l.includes('yield')) return 'Gross Yield';
  if (l.includes('appreciation')) return '5Y Appreciation';
  if (l.includes('rent growth')) return 'Rent Growth YoY';
  if (l.includes('supply')) return 'Supply Risk';
  return null;
}
import type {
  ActivityPoint, BrokerLicensePoint, DashboardDataResponse, DashboardKpi,
  DashboardPriceHistoryPoint, SalesCompositionSlice, SupplyPipelineItem,
  TopAreaItem, YieldTrendPoint,
} from '@/lib/types';

const TEAL = '#00D4AA';
const GREY = '#6B7280';
const POSITIVE = '#10B981';
const NEGATIVE = '#EF4444';
const GOLD = '#F59E0B';
const READY_COLOR = '#3B4253';

interface Props {
  data: DashboardDataResponse;
}

export function DashboardClient({ data }: Props) {
  return (
    <div className="space-y-6 pb-12">
      <MarketPulseTicker ticker={data.ticker} />
      <Section
        title="Headline KPIs"
        subtitle="Every number computed live from DLD ETL tables"
        source="DLD"
      >
        <KpiGrid kpis={data.kpis} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-12">
        <Section
          title="Sales composition"
          subtitle={`AED ${(data.sales_composition_total_aed / 1e9).toFixed(1)}B — ${data.ticker.sales_2026_ytd.toLocaleString()} transactions YTD`}
          source="DLD Sales of Units"
          className="lg:col-span-5"
        >
          <SalesCompositionDonut
            slices={data.sales_composition}
            totalAed={data.sales_composition_total_aed}
          />
        </Section>
        <Section
          title="Yearly transaction activity"
          subtitle="Off-plan vs ready, count + value, historical"
          source="DLD"
          className="lg:col-span-7"
        >
          <ActivityChart activity={data.activity} />
        </Section>
      </div>

      <Section
        title="Dubai average price per sqft"
        subtitle="Volume-weighted, off-plan vs ready"
        source="DLD Price History"
      >
        <PriceHistoryChart series={data.price_history} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Top yield areas"
          subtitle={`Gross yield (rent ÷ sale ppsf, capped 20%) — top ${data.top_yield_areas.length}`}
          source="DLD Yield History"
        >
          <TopBarList
            items={data.top_yield_areas}
            color={POSITIVE}
            valueFormat={(v) => `${v.toFixed(2)}%`}
          />
        </Section>
        <Section
          title="Top 5y appreciation"
          subtitle="Cumulative sale-ppsf change, latest 5-year window"
          source="DLD Price History"
        >
          <TopBarList
            items={data.top_appreciation_areas}
            color={GOLD}
            valueFormat={(v) => `+${v.toFixed(0)}%`}
            secondaryLabel={(s) => (s != null ? `CAGR ${s >= 0 ? '+' : ''}${s.toFixed(1)}%` : null)}
          />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Rent growth leaders YoY"
          subtitle="Median rent change 2025 → 2026"
          source="DLD Ejari"
        >
          <TopBarList
            items={data.rent_growth_leaders}
            color={POSITIVE}
            valueFormat={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
            allowNegativeColor
          />
        </Section>
        <Section
          title="Market-wide yield trend"
          subtitle={
            data.yield_trend_direction
              ? `Yields ${data.yield_trend_direction.toUpperCase()} over the series`
              : 'Yearly average across all sampled areas'
          }
          source="DLD Yield History"
        >
          <YieldTrendChart points={data.yield_trend} direction={data.yield_trend_direction} />
        </Section>
      </div>

      <Section
        title="Supply pipeline — most active project areas"
        subtitle={`Top ${data.supply_pipeline.length} areas by tracked project count, with off-plan share`}
        source="DLD Buildings"
      >
        <SupplyPipelineList items={data.supply_pipeline} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="RERA broker license growth"
          subtitle="New broker registrations per year"
          source="DLD RERA Registry"
        >
          <BrokerLicenseChart points={data.broker_stats.licenses_per_year} />
        </Section>
        <Section
          title="Top brokerage firms"
          subtitle={`Active brokers per firm — ${data.broker_stats.total_active.toLocaleString()} licensed total`}
          source="DLD RERA Registry"
        >
          <TopFirmsList firms={data.broker_stats.top_firms} />
        </Section>
      </div>

      <IntelligenceFooter footer={data.intelligence} />
    </div>
  );
}

// ===========================================================================
// Section wrapper
// ===========================================================================

function Section({
  title, subtitle, source, children, className,
}: {
  title: string;
  subtitle?: string;
  source: string;
  children: React.ReactNode;
  className?: string;
}) {
  const now = useNow();
  const tooltipKey = tooltipForLabel(title);
  return (
    <section className={cn('border border-border rounded-lg bg-bg-card overflow-hidden', className)}>
      <div className="border-b border-border px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-fg tracking-tight inline-flex items-center">
            {title}
            {tooltipKey && <MetricTooltip metric={tooltipKey} size="md" />}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-fg-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="pill pill-accent inline-flex items-center gap-1 text-[10px]">
            <Database className="h-2.5 w-2.5" strokeWidth={2.5} />
            Source: {source}
          </span>
          <span className="text-[10px] text-fg-subtle tabular hidden sm:inline">{now}</span>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function useNow(): string {
  // Render the "as of" timestamp client-side so SSR HTML doesn't get a frozen
  // stale time. Updates every minute — good enough for a dashboard heartbeat.
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const fmt = () => new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ===========================================================================
// 1. Market pulse ticker — animated on mobile, static strip on desktop
// ===========================================================================

function MarketPulseTicker({ ticker }: { ticker: DashboardDataResponse['ticker'] }) {
  const items = [
    `${ticker.sales_2026_ytd.toLocaleString()} Sales 2026 YTD`,
    `AED ${(ticker.volume_2026_aed / 1e9).toFixed(1)}B Volume`,
    ticker.top_yield_pct != null ? `${ticker.top_yield_pct.toFixed(1)}% Top Yield` : null,
    ticker.top_5y_growth_pct != null ? `+${ticker.top_5y_growth_pct.toFixed(0)}% Top 5Y Growth` : null,
    `${ticker.active_brokers.toLocaleString()} Active Brokers`,
    `${ticker.areas_tracked} Areas Tracked`,
  ].filter((s): s is string => Boolean(s));
  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="hidden md:flex items-center gap-0 divide-x divide-border">
        {items.map((s, i) => (
          <div key={i} className="flex-1 px-4 py-2.5 text-center text-xs tabular text-fg whitespace-nowrap">
            <span className="text-accent mr-1">●</span>
            {s}
          </div>
        ))}
      </div>
      <div className="md:hidden overflow-hidden relative">
        <div className="flex gap-6 px-4 py-2.5 whitespace-nowrap animate-[scroll_30s_linear_infinite]">
          {[...items, ...items].map((s, i) => (
            <span key={i} className="text-xs tabular text-fg">
              <span className="text-accent mr-1">●</span>
              {s}
            </span>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// 2. KPI tiles with count-up animation
// ===========================================================================

const KPI_ICONS: Record<string, LucideIcon> = {
  Sales: TrendingUp,
  Volume: Wallet,
  Yield: Gauge,
  Rent: CircleDollarSign,
  RERA: Users,
  'Off-plan': Building2,
};

function pickIcon(label: string) {
  for (const [k, Icon] of Object.entries(KPI_ICONS)) {
    if (label.includes(k)) return Icon;
  }
  return Sparkles;
}

function KpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {kpis.map((k, i) => (
        <KpiTile key={i} kpi={k} />
      ))}
    </div>
  );
}

function KpiTile({ kpi }: { kpi: DashboardKpi }) {
  const animated = useCountUp(kpi.value, 1200);
  const Icon = pickIcon(kpi.label);
  const formatted =
    kpi.unit === 'aed'
      ? formatAED(animated, { compact: true })
      : kpi.unit === 'pct'
        ? `${animated.toFixed(2)}%`
        : formatNumber(animated, 0);
  const deltaTone =
    kpi.delta_pct == null
      ? 'text-fg-subtle'
      : kpi.delta_pct >= 0
        ? 'text-positive'
        : 'text-negative';
  const tooltipKey = tooltipForLabel(kpi.label);
  return (
    <div className="border border-border rounded-md bg-bg-elev/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center">
          {kpi.label}
          {tooltipKey && <MetricTooltip metric={tooltipKey} />}
        </div>
        <Icon className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={2} />
      </div>
      <div className="mt-2 text-2xl md:text-3xl font-semibold text-fg tabular leading-tight">
        {formatted}
      </div>
      {(kpi.sublabel || kpi.delta_pct != null) && (
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-fg-muted">{kpi.sublabel ?? ''}</span>
          {kpi.delta_pct != null && (
            <span className={cn('tabular inline-flex items-center gap-0.5 font-medium', deltaTone)}>
              {kpi.delta_pct >= 0 ? (
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />
              )}
              {kpi.unit === 'pct'
                ? `${Math.abs(kpi.delta_pct).toFixed(2)}pp`
                : `${Math.abs(kpi.delta_pct).toFixed(1)}%`}
              {kpi.delta_label && (
                <span className="text-fg-subtle font-normal ml-1">{kpi.delta_label}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function useCountUp(target: number, ms: number): number {
  const [v, setV] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / ms);
      // ease-out cubic for a satisfying snap
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// ===========================================================================
// 3. Sales composition donut
// ===========================================================================

function SalesCompositionDonut({
  slices, totalAed,
}: { slices: SalesCompositionSlice[]; totalAed: number }) {
  if (!slices.length) return <Empty label="No composition data" />;
  const palette = [TEAL, READY_COLOR];
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="pct"
              nameKey="label"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: unknown, _name: unknown, props: { payload?: SalesCompositionSlice }) => {
                const s = props?.payload;
                if (!s) return [`${value}%`, _name as string];
                return [`${value}% — AED ${(s.volume_aed / 1e9).toFixed(2)}B`, s.label];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Total</div>
          <div className="text-sm font-semibold text-fg tabular">
            AED {(totalAed / 1e9).toFixed(1)}B
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {slices.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: palette[i % palette.length] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg">{s.label}</span>
                <span className="text-fg-muted tabular">{s.pct.toFixed(1)}%</span>
              </div>
              <div className="text-[10px] text-fg-subtle tabular">
                {s.transaction_count.toLocaleString()} tx · AED {(s.volume_aed / 1e9).toFixed(2)}B
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 4. Yearly activity chart (replaces unfeasible monthly heatmap)
// ===========================================================================

function ActivityChart({ activity }: { activity: ActivityPoint[] }) {
  if (!activity.length) return <Empty label="No activity history" />;
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={activity} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="year" stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(0,212,170,0.04)' }}
            formatter={(v: unknown, n: unknown) => [Number(v).toLocaleString(), n as string]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: AXIS_COLOR, paddingTop: 6 }}
            iconType="square"
            iconSize={10}
          />
          <Bar dataKey="offplan_count" name="Off-plan" stackId="t" fill={TEAL} radius={[0, 0, 0, 0]} />
          <Bar dataKey="ready_count" name="Ready" stackId="t" fill={READY_COLOR} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 5. Price history line chart (ready vs off-plan)
// ===========================================================================

function PriceHistoryChart({ series }: { series: DashboardPriceHistoryPoint[] }) {
  if (!series.length) return <Empty label="No price history" />;
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="year" stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <YAxis
            stroke={AXIS_COLOR}
            tick={{ fontSize: 11, fill: AXIS_COLOR }}
            tickFormatter={(v) => `${v.toLocaleString()}`}
            label={{ value: 'AED/sqft', angle: -90, position: 'insideLeft', fill: AXIS_COLOR, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: unknown, n: unknown) => [
              v != null ? Number(v).toLocaleString() : '—',
              n as string,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: AXIS_COLOR, paddingTop: 6 }}
            iconType="line"
          />
          <Line type="monotone" dataKey="avg_ppsf_ready" name="Ready" stroke={TEAL} strokeWidth={2.5} dot={{ r: 4, fill: TEAL }} />
          <Line type="monotone" dataKey="avg_ppsf_offplan" name="Off-plan" stroke={GREY} strokeWidth={2} dot={{ r: 3, fill: GREY }} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 6+7. Top-area horizontal bar list (used for yield, appreciation, rent growth)
// ===========================================================================

function TopBarList({
  items, color, valueFormat, secondaryLabel, allowNegativeColor,
}: {
  items: TopAreaItem[];
  color: string;
  valueFormat: (v: number) => string;
  secondaryLabel?: (secondary: number | null | undefined) => string | null;
  allowNegativeColor?: boolean;
}) {
  if (!items.length) return <Empty label="No data" />;
  const max = Math.max(...items.map((i) => Math.abs(i.value)));
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const pct = max > 0 ? (Math.abs(it.value) / max) * 100 : 0;
        const tone = allowNegativeColor && it.value < 0 ? NEGATIVE : color;
        const sec = secondaryLabel?.(it.secondary);
        return (
          <li key={it.area_name} className="text-xs">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-fg-muted shrink-0 w-4 tabular text-right">
                {it.rank}
              </span>
              <Link
                href={`/areas/${toAreaSlug(it.area_name)}`}
                className="flex-1 truncate text-fg hover:text-accent transition-colors"
              >
                {it.area_name}
              </Link>
              <span className="tabular font-medium" style={{ color: tone }}>
                {valueFormat(it.value)}
              </span>
            </div>
            <div className="h-1.5 bg-bg-elev rounded-sm overflow-hidden ml-5">
              <div
                className="h-full rounded-sm"
                style={{ width: `${pct}%`, backgroundColor: tone, opacity: 0.55 + 0.45 * (pct / 100) }}
              />
            </div>
            {sec && (
              <div className="ml-5 mt-0.5 text-[10px] text-fg-subtle tabular">{sec}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}


// ===========================================================================
// 8. Yield trend area chart with direction badge
// ===========================================================================

function YieldTrendChart({
  points, direction,
}: { points: YieldTrendPoint[]; direction: 'rising' | 'falling' | 'flat' | null }) {
  if (!points.length) return <Empty label="No yield trend" />;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.avg_gross_yield_pct - first.avg_gross_yield_pct;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-3xl font-semibold text-fg tabular">
            {last.avg_gross_yield_pct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-fg-subtle">latest year ({last.year})</div>
        </div>
        {direction && (
          <span
            className={cn(
              'pill inline-flex items-center gap-1',
              direction === 'rising' ? 'pill-positive' : direction === 'falling' ? 'pill-negative' : ''
            )}
          >
            {direction === 'rising' ? (
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
            ) : direction === 'falling' ? (
              <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />
            ) : (
              <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
            )}
            yields {direction} · {delta >= 0 ? '+' : ''}{delta.toFixed(2)}pp
          </span>
        )}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.25} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="year" stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, 'Yield']}
            />
            <Area
              type="monotone"
              dataKey="avg_gross_yield_pct"
              stroke={TEAL}
              strokeWidth={2.5}
              fill="url(#yieldGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ===========================================================================
// 9. Supply pipeline list
// ===========================================================================

function SupplyPipelineList({ items }: { items: SupplyPipelineItem[] }) {
  if (!items.length) return <Empty label="No supply data" />;
  const max = Math.max(...items.map((i) => i.project_count));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const pct = (it.project_count / max) * 100;
        return (
          <li key={it.area_name} className="text-xs">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="flex items-baseline gap-1.5 flex-1 min-w-0">
                <span className="text-fg-muted w-4 tabular text-right">{it.rank}</span>
                <Link
                  href={`/areas/${toAreaSlug(it.area_name)}`}
                  className="text-fg truncate hover:text-accent transition-colors"
                >
                  {it.area_name}
                </Link>
              </span>
              <span className="tabular font-medium text-fg">
                {it.project_count.toLocaleString()} projects
              </span>
            </div>
            <div className="h-2 bg-bg-elev rounded-sm overflow-hidden ml-5 relative">
              <div
                className="h-full"
                style={{ width: `${pct}%`, backgroundColor: GOLD, opacity: 0.65 }}
              />
            </div>
            <div className="ml-5 mt-0.5 flex items-center gap-3 text-[10px] text-fg-subtle tabular">
              {it.total_units != null && (
                <span>{it.total_units.toLocaleString()} units</span>
              )}
              {it.offplan_pct != null && (
                <span>{it.offplan_pct.toFixed(0)}% off-plan</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ===========================================================================
// 10a. Broker license growth line chart
// ===========================================================================

function BrokerLicenseChart({ points }: { points: BrokerLicensePoint[] }) {
  if (!points.length) return <Empty label="No license history" />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="year" stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11, fill: AXIS_COLOR }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: unknown) => [Number(v).toLocaleString(), 'New licenses']}
          />
          <Line type="monotone" dataKey="new_licenses" stroke={TEAL} strokeWidth={2.5} dot={{ r: 3, fill: TEAL }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 10b. Top broker firms leaderboard
// ===========================================================================

function TopFirmsList({ firms }: { firms: { rank: number; firm_name: string; broker_count: number }[] }) {
  if (!firms.length) return <Empty label="No firms data" />;
  const max = Math.max(...firms.map((f) => f.broker_count));
  return (
    <ol className="space-y-1.5">
      {firms.map((f) => {
        const pct = (f.broker_count / max) * 100;
        return (
          <li key={f.firm_name} className="text-xs">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="flex items-baseline gap-2 flex-1 min-w-0">
                <span className="text-fg-muted w-4 tabular text-right">#{f.rank}</span>
                <span className="text-fg truncate">{f.firm_name}</span>
              </span>
              <span className="tabular font-medium text-fg">{f.broker_count}</span>
            </div>
            <div className="h-1.5 bg-bg-elev rounded-sm overflow-hidden ml-6">
              <div className="h-full" style={{ width: `${pct}%`, backgroundColor: TEAL, opacity: 0.65 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ===========================================================================
// Data intelligence footer
// ===========================================================================

function IntelligenceFooter({ footer }: { footer: DashboardDataResponse['intelligence'] }) {
  return (
    <section className="border border-border rounded-lg bg-bg-card/60">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          <span className="text-xs font-semibold text-fg">
            Powered by Dubai Land Department Open Data
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <Stat label="Last updated" value={footer.last_updated} />
          <Stat label="Records analyzed" value={footer.records_analyzed.toLocaleString()} />
          <Stat label="Data sources" value={`${footer.data_sources.length} DLD datasets`} />
          <Stat label="Confidence" value={footer.confidence.toUpperCase()} valueClass="text-positive" />
        </div>
        <details className="mt-3 group">
          <summary className="text-[10px] text-fg-subtle cursor-pointer hover:text-fg-muted">
            View all data sources
          </summary>
          <ul className="mt-2 space-y-0.5 text-[10px] text-fg-subtle">
            {footer.data_sources.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={cn('mt-0.5 text-xs font-medium tabular text-fg', valueClass)}>{value}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-xs text-fg-subtle">{label}</div>
  );
}

// Suppress unused-icon warnings (kept for future enhancements)
void ActivitySquare; void Flame; void LineIcon; void LayoutDashboard;
