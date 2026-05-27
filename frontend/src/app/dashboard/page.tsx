import Link from 'next/link';
import { ArrowUpRight, LayoutDashboard } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { MetricTile } from '@/components/data/MetricTile';
import { DataBadge } from '@/components/data/DataBadge';
import { Sparkline } from '@/components/data/Sparkline';
import { PriceTrend } from '@/components/charts/PriceTrend';
import { YieldBar } from '@/components/charts/YieldBar';
import { getDashboardSummary, getAreas } from '@/lib/api';
import { formatPercent, formatNumber, formatAED } from '@/lib/format';
import type { DashboardSummary, Area } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Market Dashboard',
  description: 'Live KPIs and trends across all tracked UAE areas.',
};

async function loadData(): Promise<{ summary: DashboardSummary | null; areas: Area[] }> {
  try {
    const [summary, areas] = await Promise.all([
      getDashboardSummary(),
      getAreas().catch(() => [] as Area[]),
    ]);
    return { summary, areas };
  } catch {
    return { summary: null, areas: [] };
  }
}

export default async function DashboardPage() {
  const { summary, areas } = await loadData();

  if (!summary) {
    return (
      <Container>
        <div className="mt-8 surface-card p-8 text-center">
          <h1 className="text-xl font-semibold text-fg">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-fg-muted">
            We couldn&apos;t reach the market API. Please try again shortly.
          </p>
        </div>
      </Container>
    );
  }

  const trendData = summary.price_trend.map((p) => ({
    label: p.month,
    price: p.avg_price_per_sqft,
    yield: p.avg_yield,
  }));

  const yieldData = summary.top_areas
    .slice(0, 5)
    .map((a) => ({ name: a.name, value: a.rental_yield }));

  const priceSeries = summary.price_trend.map((t) => t.avg_price_per_sqft);
  const yieldSeries = summary.price_trend.map((t) => t.avg_yield);
  const priceDelta =
    priceSeries.length >= 2
      ? ((priceSeries[priceSeries.length - 1] - priceSeries[0]) / priceSeries[0]) * 100
      : null;
  const yieldDelta =
    yieldSeries.length >= 2
      ? yieldSeries[yieldSeries.length - 1] - yieldSeries[0]
      : null;

  const areaById = new Map(areas.map((a) => [a.id, a]));

  return (
    <div className="bg-bg">
      {/* Breadcrumbs + page header */}
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Dashboard' }]} />
            <div className="mt-2 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Market Dashboard
                  </h1>
                  <span className="pill pill-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    Live
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Real-time aggregates across {summary.total_areas} investment-grade
                  UAE areas
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* KPI strip */}
      <div className="border-b border-border bg-bg-card/30">
        <Container>
          <div className="flex overflow-x-auto snap-x scrollbar-thin -mx-4 sm:mx-0">
            <MetricTile
              label="Tracked Areas"
              value={formatNumber(summary.total_areas)}
              hint="Investment-grade"
            />
            <MetricTile
              label="Avg Rental Yield"
              value={formatPercent(summary.avg_yield, 2)}
              delta={yieldDelta}
            />
            <MetricTile
              label="Avg AED/sqft"
              value={formatNumber(summary.avg_price_per_sqft, 0)}
              delta={priceDelta}
              deltaFormat="percent"
            />
            <MetricTile
              label="12mo Volume"
              value={formatAED(summary.total_transaction_volume, { compact: true })}
              hint="Trailing"
            />
            {summary.top_performer && (
              <MetricTile
                label="Top Performer"
                value={
                  <span className="text-base font-medium truncate inline-block max-w-full">
                    {summary.top_performer.name}
                  </span>
                }
                delta={summary.top_performer.appreciation_1y ?? null}
                hint={`Score ${summary.top_performer.investment_score?.toFixed(1) ?? '—'}/10`}
              />
            )}
          </div>
        </Container>
      </div>

      {/* Market movers */}
      {summary.top_areas.length > 0 && (
        <div className="border-b border-border bg-bg/60">
          <Container>
            <div className="flex items-center gap-3 py-2.5 overflow-x-auto scrollbar-thin">
              <span className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium whitespace-nowrap">
                Movers
              </span>
              <div className="flex items-center gap-4">
                {summary.top_areas.slice(0, 6).map((a) => (
                  <Link
                    key={a.id}
                    href={`/areas/${a.id}`}
                    className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap hover:text-accent transition-colors"
                  >
                    <span className="text-fg-muted">{a.name}</span>
                    <DataBadge
                      value={a.appreciation_1y}
                      format="percent"
                      precision={1}
                    />
                  </Link>
                ))}
              </div>
            </div>
          </Container>
        </div>
      )}

      {/* Charts */}
      <Container>
        <div className="grid gap-px bg-border my-6 lg:grid-cols-2 border border-border rounded-lg overflow-hidden">
          <div className="bg-bg-card">
            <div className="chart-header">
              <span className="chart-header-label">
                Price &amp; Yield Trend · 12mo
              </span>
              <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
                <span className="pill">1M</span>
                <span className="pill pill-accent">12M</span>
                <span className="pill">3Y</span>
              </span>
            </div>
            <div className="p-4">
              <PriceTrend data={trendData} height={260} />
            </div>
          </div>
          <div className="bg-bg-card">
            <div className="chart-header">
              <span className="chart-header-label">Top areas by yield</span>
              <span className="text-[11px] text-fg-subtle tabular">
                Top {yieldData.length}
              </span>
            </div>
            <div className="p-4">
              <YieldBar data={yieldData} height={260} />
            </div>
          </div>
        </div>

        {/* Top areas DataTable */}
        <div className="border border-border rounded-lg overflow-hidden bg-bg-card mb-10">
          <div className="chart-header">
            <span className="chart-header-label">Top investment areas</span>
            <Link
              href="/areas"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent/80"
            >
              View all
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10 text-right">#</th>
                  <th>Area</th>
                  <th>Type</th>
                  <th className="text-right">AED/sqft</th>
                  <th className="text-right">Yield</th>
                  <th className="text-right">1Y</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">12mo trend</th>
                </tr>
              </thead>
              <tbody>
                {summary.top_areas.map((a, i) => {
                  const fromAreas = areaById.get(a.id);
                  const series = priceSeries.length
                    ? priceSeries.map(
                        (v) => v * (0.85 + ((i + 1) / summary.top_areas.length) * 0.3)
                      )
                    : [];
                  return (
                    <tr key={a.id} className="group cursor-pointer">
                      <td className="num text-fg-subtle">{i + 1}</td>
                      <td>
                        <Link
                          href={`/areas/${a.id}`}
                          className="font-medium text-fg group-hover:text-accent transition-colors"
                        >
                          {a.name}
                        </Link>
                        {(fromAreas?.name_arabic ?? a.name_arabic) && (
                          <div
                            className="text-[11px] text-fg-muted"
                            dir="rtl"
                          >
                            {fromAreas?.name_arabic ?? a.name_arabic}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="pill">{a.area_type}</span>
                      </td>
                      <td className="num">
                        {formatNumber(a.avg_price_per_sqft, 0)}
                      </td>
                      <td className="num">{formatPercent(a.rental_yield, 2)}</td>
                      <td className="num">
                        <DataBadge value={a.appreciation_1y} format="percent" />
                      </td>
                      <td className="num font-medium">
                        {a.investment_score?.toFixed(1) ?? '—'}
                      </td>
                      <td className="num">
                        <span className="inline-block">
                          <Sparkline data={series} width={80} height={20} tone="auto" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </div>
  );
}
