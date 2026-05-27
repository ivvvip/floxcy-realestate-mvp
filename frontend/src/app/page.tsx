import Link from 'next/link';
import {
  ArrowRight,
  Sparkles,
  GitCompare,
  Database,
  RefreshCw,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { getDashboardSummary, getAreaStats } from '@/lib/api';
import type { DashboardSummary, AreaStats, TopAreaItem } from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { Container } from '@/components/Container';
import { MetricTile } from '@/components/data/MetricTile';
import { DataBadge } from '@/components/data/DataBadge';
import { Sparkline } from '@/components/data/Sparkline';
import { RoiMiniWidget } from './RoiMiniWidget';

export const revalidate = 300;

export default async function HomePage() {
  let summary: DashboardSummary | null = null;
  let stats: AreaStats | null = null;
  try {
    [summary, stats] = await Promise.all([
      getDashboardSummary(),
      getAreaStats(),
    ]);
  } catch {
    // Render fallbacks below if API unavailable
  }

  const trend = summary?.price_trend ?? [];
  const priceSeries = trend.map((t) => t.avg_price_per_sqft);
  const yieldSeries = trend.map((t) => t.avg_yield);
  const volumeSeries = trend.map((t) => t.avg_price_per_sqft * 100);
  const priceDelta =
    priceSeries.length >= 2
      ? ((priceSeries[priceSeries.length - 1] - priceSeries[0]) / priceSeries[0]) * 100
      : null;
  const yieldDelta =
    yieldSeries.length >= 2
      ? yieldSeries[yieldSeries.length - 1] - yieldSeries[0]
      : null;
  const topAreas = (summary?.top_areas ?? []).slice(0, 8);
  const lastUpdated = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
  });

  return (
    <div className="bg-bg">
      {/* Top stat strip */}
      <section className="border-b border-border bg-bg-card/30">
        <Container>
          <div className="flex overflow-x-auto snap-x scrollbar-thin -mx-4 sm:mx-0">
            <MetricTile
              label="Tracked Areas"
              value={formatNumber(stats?.total_count ?? summary?.total_areas ?? 0)}
              hint={`${Object.keys(stats?.count_by_type ?? {}).length} segments`}
            />
            <MetricTile
              label="Avg Yield"
              value={summary ? formatPercent(summary.avg_yield, 2) : '—'}
              delta={yieldDelta}
              deltaFormat="percent"
            />
            <MetricTile
              label="Avg AED/sqft"
              value={summary ? formatNumber(summary.avg_price_per_sqft, 0) : '—'}
              delta={priceDelta}
              deltaFormat="percent"
            />
            <MetricTile
              label="12mo Volume"
              value={
                summary
                  ? formatAED(summary.total_transaction_volume, { compact: true })
                  : '—'
              }
              hint="Trailing"
            />
            <MetricTile
              label="Top Performer"
              value={
                <span className="text-base font-medium truncate inline-block max-w-full">
                  {summary?.top_performer?.name ?? '—'}
                </span>
              }
              delta={summary?.top_performer?.appreciation_1y ?? null}
              deltaFormat="percent"
            />
          </div>
        </Container>
      </section>

      {/* H1 strip */}
      <section className="border-b border-border">
        <Container>
          <div className="py-7 md:py-9 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="pill pill-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  Live data
                </span>
                <span className="text-[11px] text-fg-subtle tabular">
                  Last updated · {lastUpdated} GST
                </span>
              </div>
              <h1 className="mt-3 text-[28px] md:text-[32px] font-semibold tracking-tight text-fg leading-tight">
                UAE Real Estate Market Intelligence
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-fg-muted">
                The AI-powered terminal for UAE real estate investing. Live area
                metrics, yield analytics, and AI-ranked opportunities — built
                for serious investors.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                Open Dashboard
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
              <Link
                href="/advisor"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                AI Advisor
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Market intelligence cards row */}
      <section className="border-b border-border">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border my-px">
            <IntelCard
              label="Price Index · 12mo"
              value={
                summary && priceSeries.length
                  ? formatNumber(priceSeries[priceSeries.length - 1], 0)
                  : '—'
              }
              hint="AED / sqft (avg)"
              delta={priceDelta}
              series={priceSeries}
            />
            <IntelCard
              label="Yield · 12mo"
              value={
                summary && yieldSeries.length
                  ? formatPercent(yieldSeries[yieldSeries.length - 1], 2)
                  : '—'
              }
              hint="Rental yield avg"
              delta={yieldDelta}
              series={yieldSeries}
            />
            <IntelCard
              label="Activity Index"
              value={
                summary
                  ? formatAED(summary.total_transaction_volume, { compact: true })
                  : '—'
              }
              hint="Transaction volume proxy"
              delta={priceDelta}
              series={volumeSeries}
            />
          </div>
        </Container>
      </section>

      {/* Top areas preview table */}
      <section className="border-b border-border">
        <Container>
          <div className="py-6">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                  Top opportunities
                </div>
                <h2 className="mt-1 text-lg font-semibold text-fg">
                  AI-ranked UAE investment areas
                </h2>
              </div>
              <Link
                href="/areas"
                className="text-xs font-medium text-accent hover:text-accent/80 inline-flex items-center gap-1"
              >
                View all areas
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
            <TopAreasTable rows={topAreas} />
          </div>
        </Container>
      </section>

      {/* ROI mini widget */}
      <section className="border-b border-border">
        <Container>
          <div className="my-6 border border-border rounded-lg bg-bg-card overflow-hidden">
            <RoiMiniWidget />
          </div>
        </Container>
      </section>

      {/* Advisor CTA strip */}
      <section className="border-b border-border bg-bg-card/30">
        <Container>
          <div className="py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <div className="text-sm font-medium text-fg">
                  AI Investment Advisor
                </div>
                <div className="text-xs text-fg-muted">
                  <span className="tabular">1.</span> Set budget &middot;{' '}
                  <span className="tabular">2.</span> Choose goal &amp; risk
                  &middot; <span className="tabular">3.</span> Get ranked areas with reasoning
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/compare"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                <GitCompare className="h-3.5 w-3.5" strokeWidth={2} />
                Compare areas
              </Link>
              <Link
                href="/advisor"
                className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors"
              >
                Open advisor
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Trust / methodology */}
      <section className="border-b border-border">
        <Container>
          <div className="py-6">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Methodology &amp; Coverage
            </div>
            <h2 className="mt-1 text-lg font-semibold text-fg">
              How Floxcy builds market intelligence
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border mb-px">
            <TrustCard
              icon={Database}
              title="Data Sources"
              body="DLD transaction records, REIDIN, public rental indices, on-the-ground broker feedback."
            />
            <TrustCard
              icon={RefreshCw}
              title="Update Cadence"
              body="Market snapshots refreshed every 24h. Yield and price-per-sqft computed on rolling 30-day window."
            />
            <TrustCard
              icon={Globe}
              title="Coverage"
              body={`${stats?.total_count ?? '—'} curated UAE areas spanning residential, commercial and mixed-use.`}
            />
            <TrustCard
              icon={ShieldCheck}
              title="Methodology"
              body="Investment scores combine yield, appreciation, demand, and risk weights tuned by goal."
            />
          </div>
        </Container>
      </section>
    </div>
  );
}

function IntelCard({
  label,
  value,
  hint,
  delta,
  series,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  series: number[];
}) {
  return (
    <div className="bg-bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            {label}
          </div>
          <div className="mt-2 text-2xl tabular text-fg">{value}</div>
          {hint && <div className="mt-0.5 text-[11px] text-fg-subtle">{hint}</div>}
        </div>
        {delta != null && <DataBadge value={delta} format="percent" />}
      </div>
      <div className="mt-4 w-full h-12">
        <Sparkline data={series} width={undefined as unknown as number} height={48} tone="auto" />
      </div>
    </div>
  );
}

function TopAreasTable({ rows }: { rows: TopAreaItem[] }) {
  if (!rows.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
        No data yet — seed the database via{' '}
        <Link href="/admin" className="text-accent hover:underline">
          admin
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-bg-card">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10 text-right">#</th>
              <th>Area</th>
              <th>Type</th>
              <th className="text-right">AED/sqft</th>
              <th className="text-right">Yield</th>
              <th className="text-right">1Y Appreciation</th>
              <th className="text-right">Score</th>
              <th>{/* CTA */}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="group cursor-pointer">
                <td className="num text-fg-subtle">{i + 1}</td>
                <td>
                  <Link
                    href={`/areas/${r.id}`}
                    className="font-medium text-fg group-hover:text-accent transition-colors"
                  >
                    {r.name}
                  </Link>
                  {r.name_arabic && (
                    <div className="text-[11px] text-fg-muted" dir="rtl">
                      {r.name_arabic}
                    </div>
                  )}
                </td>
                <td>
                  <span className="pill">{r.area_type}</span>
                </td>
                <td className="num">{formatNumber(r.avg_price_per_sqft, 0)}</td>
                <td className="num">{formatPercent(r.rental_yield, 2)}</td>
                <td className="num">
                  <DataBadge value={r.appreciation_1y} format="percent" />
                </td>
                <td className="num font-medium">
                  {r.investment_score != null
                    ? formatNumber(r.investment_score, 1)
                    : '—'}
                </td>
                <td>
                  <Link
                    href={`/areas/${r.id}`}
                    className="text-[11px] font-medium text-fg-muted group-hover:text-accent transition-colors inline-flex items-center gap-0.5"
                  >
                    Detail
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrustCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Database;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-bg-card p-5">
      <Icon className="h-4 w-4 text-fg-muted" strokeWidth={2} />
      <div className="mt-3 text-sm font-medium text-fg">{title}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}
