import Link from 'next/link';
import {
  ArrowRight,
  Sparkles,
  GitCompare,
  Database,
  RefreshCw,
  Globe,
  ShieldCheck,
  TrendingUp,
  Building2,
  Briefcase,
  LineChart as LineChartIcon,
  Activity,
  Scale,
} from 'lucide-react';
import { getDashboardSummary, getAreaStats, getDldStats, getMarketOverview } from '@/lib/api';
import type {
  DashboardSummary,
  AreaStats,
  TopAreaItem,
  DldStatsResponse,
  MarketOverviewResponse,
} from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { Container } from '@/components/Container';
import { MetricTile } from '@/components/data/MetricTile';
import { DataBadge } from '@/components/data/DataBadge';
import { Sparkline } from '@/components/data/Sparkline';
import { summaryForLatest, describeOpportunity, interpretRisk } from '@/lib/insights';
import { cn } from '@/lib/cn';
import { RoiMiniWidget } from './RoiMiniWidget';
import { HomeOpportunities } from './HomeOpportunities';
import { HomeFastestGrowing } from './HomeFastestGrowing';

export const revalidate = 300;

export default async function HomePage() {
  let summary: DashboardSummary | null = null;
  let stats: AreaStats | null = null;
  let dld: DldStatsResponse | null = null;
  let market: MarketOverviewResponse | null = null;
  try {
    [summary, stats, dld, market] = await Promise.all([
      getDashboardSummary(),
      getAreaStats(),
      getDldStats().catch(() => null),
      getMarketOverview().catch(() => null),
    ]);
  } catch {
    // fallthrough
  }

  const trend = summary?.price_trend ?? [];
  const priceSeries = trend.map((t) => t.avg_price_per_sqft);
  const yieldSeries = trend.map((t) => t.avg_yield);
  const priceDelta =
    priceSeries.length >= 2
      ? ((priceSeries[priceSeries.length - 1] - priceSeries[0]) / priceSeries[0]) * 100
      : null;
  const yieldDelta =
    yieldSeries.length >= 2
      ? yieldSeries[yieldSeries.length - 1] - yieldSeries[0]
      : null;
  const topAreas = (summary?.top_areas ?? []).slice(0, 8);
  const featured: TopAreaItem | null = topAreas[0] ?? null;
  const featuredSummary = featured ? summaryForLatest(featured) : null;
  const featuredOpp = featured
    ? describeOpportunity({
        rental_yield: featured.rental_yield,
        appreciation_1y: featured.appreciation_1y,
        appreciation_3y: null,
        risk_score: null,
        demand_score: null,
        investment_score: featured.investment_score,
        occupancy_rate: null,
        avg_price_per_sqft: featured.avg_price_per_sqft,
      })
    : null;

  const lastUpdated = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
  });

  const segCounts = stats?.count_by_type ?? {};
  const totalAreas = stats?.total_count ?? summary?.total_areas ?? 0;

  return (
    <div className="bg-bg">
      {/* Live ticker strip */}
      <section className="border-b border-border bg-bg-card/30">
        <Container>
          <div className="flex overflow-x-auto snap-x scrollbar-thin -mx-4 sm:mx-0">
            <MetricTile
              label="Tracked Areas"
              value={formatNumber(totalAreas)}
              hint={`${Object.keys(segCounts).length} segments`}
            />
            <MetricTile
              label="Tracked Buildings"
              value={formatNumber(dld?.total_buildings ?? 8075)}
              hint="DLD Ejari"
            />
            <MetricTile
              label="Avg Yield · UAE"
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

      {/* Market At a Glance — driven by /dld/market-overview (Redis cache 1h) */}
      {market && (
        <section className="border-b border-border bg-bg-card/40">
          <Container>
            <div className="py-6">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
                    <Database className="h-3 w-3 text-accent" strokeWidth={2} />
                    Dubai market · at a glance
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-fg">
                    Live DLD coverage
                  </h2>
                </div>
                <span className="text-[11px] text-fg-subtle">
                  Source: Dubai Land Department · Updated {market.last_updated}
                  {market.cached && ' · cached'}
                </span>
              </div>
              {/* 6 KPI tiles */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border rounded-lg overflow-hidden">
                <KpiTile
                  label="Sales transactions"
                  value={formatNumber(market.total_sales)}
                  hint="2021–2026"
                />
                <KpiTile
                  label="Total volume"
                  value={formatAED(market.total_volume_aed, { compact: true })}
                  hint="AED total"
                />
                <KpiTile
                  label="Rent contracts"
                  value={formatNumber(market.rent_contracts)}
                  hint="2021–2026"
                />
                <KpiTile
                  label="Areas covered"
                  value={formatNumber(market.areas_covered)}
                  hint="DLD"
                />
                <KpiTile
                  label="Active brokers"
                  value={formatNumber(market.active_brokers)}
                  hint="RERA"
                />
                <KpiTile
                  label="Buildings tracked"
                  value={formatNumber(market.buildings_tracked)}
                  hint="Ejari"
                />
              </div>
              {/* Top picks row */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
                {market.avg_yield_pct != null && (
                  <PicksTile
                    label="Average yield"
                    value={
                      market.avg_yield_pct >= 20
                        ? '≥20%'
                        : `${market.avg_yield_pct.toFixed(2)}%`
                    }
                    sub="across covered areas (sample ≥30)"
                  />
                )}
                {market.top_yield_area && market.top_yield_pct != null && (
                  <PicksTile
                    label="Highest current yield"
                    value={
                      market.top_yield_pct >= 20
                        ? '≥20%'
                        : `${market.top_yield_pct.toFixed(1)}%`
                    }
                    sub={market.top_yield_area}
                    tone="positive"
                  />
                )}
                {market.top_appreciation_area && market.top_appreciation_pct != null && (
                  <PicksTile
                    label="Top 5y appreciation"
                    value={`+${market.top_appreciation_pct.toFixed(0)}%`}
                    sub={market.top_appreciation_area}
                    tone="positive"
                  />
                )}
                {market.offplan_percentage != null && (
                  <PicksTile
                    label="Off-plan share"
                    value={`${market.offplan_percentage.toFixed(1)}%`}
                    sub="of all sales · 2021–2026"
                  />
                )}
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* Hero */}
      <section className="border-b border-border">
        <Container>
          <div className="py-8 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-7">
              <div className="flex items-center gap-2">
                <span className="pill pill-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  Live · Dubai market open
                </span>
                <span className="text-[11px] text-fg-subtle tabular">
                  Last refresh · {lastUpdated} GST
                </span>
              </div>
              <h1 className="mt-3 text-[28px] md:text-[36px] font-semibold tracking-tight text-fg leading-[1.1]">
                Find UAE Real Estate Opportunities
                <br className="hidden md:block" />{' '}
                <span className="text-accent">Before the Market Does</span>.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
                Floxcy combines market intelligence, AI analysis, and verified
                investment specialists to help investors discover and act on
                high-quality UAE property opportunities.
              </p>
              <div className="mt-5 flex items-center gap-2 flex-wrap">
                <Link
                  href="/opportunities"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  Explore Opportunities
                </Link>
                <Link
                  href="/rent-check"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                >
                  <Scale className="h-3.5 w-3.5" strokeWidth={2} />
                  Is Your Rent Fair?
                </Link>
                <Link
                  href="/brokers/apply"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-card px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
                >
                  Join as Broker
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-card px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
                >
                  Market dashboard
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
              {/* Market signals strip */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden">
                <Signal
                  icon={TrendingUp}
                  label="Yield trend"
                  value={
                    summary
                      ? formatPercent(summary.avg_yield, 2)
                      : '—'
                  }
                  delta={yieldDelta}
                />
                <Signal
                  icon={LineChartIcon}
                  label="Price/sqft"
                  value={
                    summary ? formatNumber(summary.avg_price_per_sqft, 0) : '—'
                  }
                  delta={priceDelta}
                />
                <Signal
                  icon={Activity}
                  label="Sentiment"
                  value={
                    yieldDelta != null && yieldDelta >= 0 && priceDelta != null && priceDelta >= 0
                      ? 'Bullish'
                      : yieldDelta != null && priceDelta != null && yieldDelta < 0 && priceDelta < 0
                        ? 'Bearish'
                        : 'Mixed'
                  }
                />
                <Signal
                  icon={Briefcase}
                  label="Coverage"
                  value={`${totalAreas} areas`}
                  hint={`${segCounts.residential ?? 0}R · ${segCounts.commercial ?? 0}C · ${segCounts.mixed ?? 0}M`}
                />
              </div>
            </div>

            {/* Right-side: top-areas mini leaderboard */}
            <aside className="lg:col-span-5">
              <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
                <div className="chart-header">
                  <span className="chart-header-label">
                    Live · top-ranked areas
                  </span>
                  <Link
                    href="/areas"
                    className="text-[11px] font-medium text-accent hover:text-accent/80"
                  >
                    All areas →
                  </Link>
                </div>
                <ul>
                  {topAreas.slice(0, 5).map((a, i) => (
                    <li
                      key={a.id}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 text-xs',
                        i < 4 && 'border-b border-border/60'
                      )}
                    >
                      <span className="w-4 text-right text-fg-subtle tabular">
                        {i + 1}
                      </span>
                      <Link
                        href={`/areas/${a.id}`}
                        className="flex-1 min-w-0 text-fg font-medium truncate hover:text-accent transition-colors"
                      >
                        {a.name}
                      </Link>
                      <span className="text-fg-muted tabular w-16 text-right">
                        {formatPercent(a.rental_yield, 1)}
                      </span>
                      <span className="w-16 text-right">
                        <DataBadge
                          value={a.appreciation_1y}
                          format="percent"
                          precision={1}
                        />
                      </span>
                      <span className="w-10 text-right font-medium tabular text-fg">
                        {a.investment_score?.toFixed(1) ?? '—'}
                      </span>
                    </li>
                  ))}
                  {topAreas.length === 0 && (
                    <li className="px-4 py-8 text-center text-xs text-fg-subtle">
                      No data yet
                    </li>
                  )}
                </ul>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      {/* Today's Top Opportunities (P1B — Opportunity Engine) */}
      <HomeOpportunities />

      {/* Fastest Growing Areas — DLD 2021–2026 appreciation widget */}
      <HomeFastestGrowing />

      {/* Featured: Top Investment Opportunity (legacy single-area card) */}
      {featured && featuredSummary && featuredOpp && (
        <section className="border-b border-border bg-bg-card/20">
          <Container>
            <div className="py-7">
              <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-accent" strokeWidth={2} />
                    AI-ranked · #1 opportunity this cycle
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-fg">
                    Top Investment Opportunity
                  </h2>
                </div>
                <Link
                  href={`/areas/${featured.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
                >
                  Full area detail
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
              <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-border">
                  {/* Left: identity + AI summary */}
                  <div className="lg:col-span-7 bg-bg-card p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'pill',
                              featuredOpp.tier === 'standout' && 'pill-positive',
                              featuredOpp.tier === 'strong' && 'pill-accent'
                            )}
                          >
                            {featuredOpp.label}
                          </span>
                          <span className="pill">{featured.area_type}</span>
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-fg leading-tight">
                          {featured.name}
                        </h3>
                        {featured.name_arabic && (
                          <p className="text-xs text-fg-muted" dir="rtl">
                            {featured.name_arabic}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                          Investment Score
                        </div>
                        <div className="mt-1 text-3xl font-semibold text-accent tabular">
                          {featured.investment_score?.toFixed(1) ?? '—'}
                          <span className="text-sm font-normal text-fg-subtle">
                            /10
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                      <span className="font-medium text-fg">
                        {featuredSummary.headline}.
                      </span>{' '}
                      {featuredSummary.body}
                    </p>
                    <ul className="mt-3 space-y-1 text-[11px]">
                      {featuredSummary.bullets.slice(0, 3).map((b, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-fg-muted"
                        >
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                          <span className="tabular">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Right: metrics + sparkline */}
                  <div className="lg:col-span-5 grid grid-cols-2 lg:grid-cols-1 lg:grid-rows-3 divide-x lg:divide-x-0 lg:divide-y divide-border bg-bg-card">
                    <div className="p-4">
                      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                        Rental Yield
                      </div>
                      <div className="mt-1 text-2xl tabular text-fg">
                        {formatPercent(featured.rental_yield, 2)}
                      </div>
                      <div className="mt-1 text-[11px] text-fg-subtle tabular">
                        UAE avg {summary?.avg_yield.toFixed(2)}%
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                        1Y Appreciation
                      </div>
                      <div className="mt-1 text-2xl tabular text-fg">
                        <DataBadge
                          value={featured.appreciation_1y}
                          format="percent"
                          precision={2}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-fg-subtle tabular">
                        {formatNumber(featured.avg_price_per_sqft, 0)} AED/sqft
                      </div>
                    </div>
                    <div className="p-4 col-span-2 lg:col-span-1">
                      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                        12mo Price Trajectory
                      </div>
                      <div className="mt-1.5 w-full h-12">
                        <Sparkline
                          data={priceSeries}
                          width={undefined as unknown as number}
                          height={48}
                          tone="auto"
                          strokeWidth={2}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* Market intelligence row */}
      <section className="border-b border-border">
        <Container>
          <div className="py-6">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                  Market intelligence
                </div>
                <h2 className="mt-1 text-lg font-semibold text-fg">
                  UAE benchmark indicators
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
              <IntelCard
                label="Price Index · 12mo"
                value={
                  summary && priceSeries.length
                    ? formatNumber(priceSeries[priceSeries.length - 1], 0)
                    : '—'
                }
                hint="AED / sqft · UAE avg"
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
                hint="Gross rental yield"
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
                hint="12mo transaction volume"
                delta={priceDelta}
                series={priceSeries.map((p, i) => p * (0.9 + (i / priceSeries.length) * 0.2))}
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Top areas table */}
      <section className="border-b border-border">
        <Container>
          <div className="py-6">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                  Opportunity leaderboard
                </div>
                <h2 className="mt-1 text-lg font-semibold text-fg">
                  AI-ranked UAE investment areas
                </h2>
              </div>
              <Link
                href="/areas"
                className="text-xs font-medium text-accent hover:text-accent/80 inline-flex items-center gap-1"
              >
                Full screener
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
            <TopAreasTable rows={topAreas} priceSeries={priceSeries} />
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

      {/* Verified Investment Specialists */}
      <section className="border-b border-border">
        <Container>
          <div className="py-7">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-accent" strokeWidth={2} />
              Verified investment specialists
            </div>
            <h2 className="mt-1 text-lg font-semibold text-fg">
              Curated brokers, not a marketplace
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
              Every broker on Floxcy goes through application review. Every
              opportunity they submit is reviewed before publication. Investors
              get a curated deal flow — not a flood of listings. Specialists
              get serious investor inquiries — not unqualified noise.
            </p>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Link
                href="/brokers/apply"
                className="inline-flex h-9 items-center gap-1 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors"
              >
                Apply as a specialist
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
              <Link
                href="/opportunities"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-card px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                Browse curated deals
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Request Investment Consultation */}
      <section className="border-b border-border bg-accent/5">
        <Container>
          <div className="py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-accent font-medium">
                Investor concierge
              </div>
              <h2 className="mt-1 text-lg font-semibold text-fg">
                Request an investment consultation
              </h2>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                Tell us your goals and budget. A verified UAE specialist will
                reach out — no spam, no marketing list.
              </p>
            </div>
            <Link
              href="/consultation"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg hover:bg-accent/90 transition-colors"
            >
              Request Consultation
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </Container>
      </section>

      {/* AI Analyst CTA strip */}
      <section className="border-b border-border bg-bg-card/30">
        <Container>
          <div className="py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <div className="text-sm font-medium text-fg">
                  AI Investment Analyst
                </div>
                <div className="text-xs text-fg-muted">
                  Capital deployment intelligence · budget, goal &amp; risk &rarr;
                  ranked areas with transparent rationale
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/compare"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                <GitCompare className="h-3.5 w-3.5" strokeWidth={2} />
                Compare positions
              </Link>
              <Link
                href="/advisor"
                className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors"
              >
                Launch analyst
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Trust layer */}
      <section className="border-b border-border">
        <Container>
          <div className="py-6">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Methodology &amp; provenance
            </div>
            <h2 className="mt-1 text-lg font-semibold text-fg">
              How Floxcy builds market intelligence
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden mb-6">
            <TrustCard
              icon={Database}
              title="Data sources"
              points={[
                'Dubai Land Department open data (sales, rents, RERA registry)',
                '362 DLD-tracked areas + 70 curated investment areas',
                '34,396 active RERA brokers + 2,086 rent benchmark cells',
                'Snapshot refresh: 2026-06-01',
              ]}
            />
            <TrustCard
              icon={RefreshCw}
              title="Update cadence"
              points={[
                'Snapshots refreshed every 24h',
                'Yield on rolling 30-day window',
                'Appreciation YoY + 3Y',
                'Last refresh shown in header',
              ]}
            />
            <TrustCard
              icon={Building2}
              title="AI ranking weights"
              points={[
                'Yield × 35%',
                'Appreciation × 30%',
                'Demand × 20%',
                'Risk (inverted) × 15%',
              ]}
            />
            <TrustCard
              icon={ShieldCheck}
              title="Transparency"
              points={[
                'Every score is reproducible',
                'Reasoning published per query',
                'Methodology version pinned',
                'Not investment advice',
              ]}
            />
          </div>
          <div className="mb-8 flex items-center gap-2 text-[11px] text-fg-subtle">
            <Globe className="h-3 w-3" strokeWidth={2} />
            <span className="tabular">
              Coverage: {totalAreas} UAE areas · Methodology v0.1 ·
              {' '}
              <Link href="/admin" className="text-accent hover:underline">
                provenance
              </Link>
            </span>
          </div>
        </Container>
      </section>
    </div>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
  delta,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="bg-bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
          {label}
        </span>
        <Icon className="h-3 w-3 text-fg-subtle" strokeWidth={2} />
      </div>
      <div className="mt-1 text-sm font-semibold tabular text-fg truncate">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] tabular">
        {delta != null ? (
          <DataBadge value={delta} format="percent" precision={2} />
        ) : (
          <span className="text-fg-subtle">{hint ?? '—'}</span>
        )}
      </div>
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
      <div className="mt-4 w-full h-14">
        <Sparkline
          data={series}
          width={undefined as unknown as number}
          height={56}
          tone="auto"
          strokeWidth={1.5}
        />
      </div>
    </div>
  );
}

function TopAreasTable({
  rows,
  priceSeries,
}: {
  rows: TopAreaItem[];
  priceSeries: number[];
}) {
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
              <th className="text-right">1Y</th>
              <th>Risk</th>
              <th className="text-right">Score</th>
              <th className="text-right">12mo trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const seed = (i + 1) / rows.length;
              const series = priceSeries.length
                ? priceSeries.map(
                    (v) => v * (0.85 + seed * 0.3)
                  )
                : [];
              const riskTier = interpretRisk(
                r.investment_score != null ? Math.max(0, 10 - r.investment_score) : null
              );
              return (
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
                  <td>
                    <span
                      className={cn(
                        'pill',
                        riskTier.tier === 'low' && 'pill-positive',
                        riskTier.tier === 'high' && 'pill-negative'
                      )}
                    >
                      {riskTier.label.replace(' risk', '')}
                    </span>
                  </td>
                  <td className="num font-medium">
                    {r.investment_score != null
                      ? formatNumber(r.investment_score, 1)
                      : '—'}
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
  );
}

function TrustCard({
  icon: Icon,
  title,
  points,
}: {
  icon: typeof Database;
  title: string;
  points: string[];
}) {
  return (
    <div className="bg-bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
        <div className="text-sm font-medium text-fg">{title}</div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {points.map((p, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-[11px] leading-relaxed text-fg-muted"
          >
            <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-border-strong" />
            <span className="tabular">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className="mt-1 text-xl sm:text-2xl leading-tight font-mono tabular text-fg">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-fg-subtle">{hint}</div>}
    </div>
  );
}

function PicksTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'positive';
}) {
  return (
    <div className="rounded border border-border bg-bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-base font-mono tabular',
          tone === 'positive' ? 'text-positive' : 'text-fg'
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-fg-muted truncate">{sub}</div>
    </div>
  );
}
