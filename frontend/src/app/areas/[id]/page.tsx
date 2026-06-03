import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  MapPin,
  ExternalLink,
  GitCompare,
  Calculator,
  Sparkles,
  ShieldAlert,
  Target,
  Info,
} from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { MetricTile } from '@/components/data/MetricTile';
import { DataBadge } from '@/components/data/DataBadge';
import { ApiError, getArea, getAreaConfidence, getAreaUndervaluation, getDldAreaCategoryBreakdown, getDldAreaLifestyleScore, getDldAreaTopBuildings, getDldAreaPriceHistory, getDldAreaRentHistory, getDldAreaUpcomingAvailability, getDldAreaYieldHistory, getOffplanProjects } from '@/lib/api';
import type { AreaLimitedDetail, AreaDetail } from '@/lib/types';
import { LimitedAreaPage } from './LimitedAreaPage';
import { FloxcyInsight } from './FloxcyInsight';
import { PriceTrend } from '@/components/charts/PriceTrend';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import {
  buildInvestmentSummary,
  interpretRisk,
  describeOpportunity,
} from '@/lib/insights';
import { cn } from '@/lib/cn';
import { ConfidenceBadge, ConfidenceWarningBanner } from '@/components/data/ConfidenceBadge';
import { AreaAiInsightCard } from '@/components/data/AreaAiInsightCard';
import type { ConfidenceReport, OpportunityResult } from '@/lib/types';

const TYPE_TONE: Record<string, string> = {
  'Premium Hold': 'pill-accent',
  'Growth Opportunity': 'pill-positive',
  Speculative: 'pill-negative',
  'Income Opportunity': 'pill-positive',
  'Value Opportunity': 'pill-accent',
  Balanced: '',
};

export const revalidate = 60;

interface AreaDetailProps {
  params: { id: string };
}

const TYPE_LABEL: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  mixed: 'Mixed-Use',
};

export async function generateMetadata({
  params,
}: AreaDetailProps): Promise<Metadata> {
  try {
    const area = await getArea(params.id);
    if ('latest' in area) {
      return {
        title: area.name,
        description:
          area.description ??
          `${area.name} — a curated investment area in ${area.city}, ${area.emirate}.`,
      };
    }
    return {
      title: `${area.name} — DLD area`,
      description: `${area.name} · Dubai Land Department area. Median PPSF, yield, YoY rent growth, and confidence — never fabricated.`,
    };
  } catch {
    return { title: 'Area' };
  }
}

function isLimitedArea(
  a: AreaDetail | AreaLimitedDetail
): a is AreaLimitedDetail {
  // AreaLimitedDetail has dld and coverage_tier but NO `latest`/`history`.
  return !('latest' in a);
}

export default async function AreaDetailPage({ params }: AreaDetailProps) {
  let raw;
  try {
    raw = await getArea(params.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // Universal slug resolver: when /areas/[slug] resolves to a DLD-only area
  // we render the LimitedAreaPage with whatever DLD data we have, instead of
  // the full curated layout (which assumes MarketSnapshot history).
  if (isLimitedArea(raw)) {
    return <LimitedAreaPage area={raw} />;
  }
  const area = raw;

  let confidence: ConfidenceReport | null = null;
  let undervaluation: OpportunityResult | null = null;
  try {
    const [c, u] = await Promise.all([
      getAreaConfidence(params.id).catch(() => null),
      getAreaUndervaluation(params.id).catch(() => null),
    ]);
    confidence = c;
    undervaluation = u;
  } catch {
    // both already swallowed individually
  }

  // Pull top buildings in this area via DLD overlay's mapped name_norm.
  // Soft-fail: many community-named areas have 0 mapped buildings (admin
  // sector mismatch — known taxonomy gap), so we hide the section quietly.
  const topBuildings = area.dld?.dld_name
    ? await getDldAreaTopBuildings(area.dld.dld_name.toLowerCase(), 6).catch(
        () => null
      )
    : null;

  // 5-year price history from etl_dld_history.py — hidden when the area
  // has no qualifying Sales-of-Unit rows in the 2021–2026 export.
  const priceHistory = area.dld?.dld_name
    ? await getDldAreaPriceHistory(area.dld.dld_name.toLowerCase()).catch(
        () => null
      )
    : null;

  // Rent + yield history from etl_dld_rent_history.py — both hidden cleanly
  // when no data is available for the area.
  const rentHistory = area.dld?.dld_name
    ? await getDldAreaRentHistory(area.dld.dld_name.toLowerCase()).catch(
        () => null
      )
    : null;
  const yieldHistory = area.dld?.dld_name
    ? await getDldAreaYieldHistory(area.dld.dld_name.toLowerCase()).catch(
        () => null
      )
    : null;

  // Upcoming availability over the next 90 days (Availability Tracker).
  // Hidden when the area has no Person residential leases ending in the window.
  const upcomingAvailability = area.dld?.dld_name
    ? await getDldAreaUpcomingAvailability(
        area.dld.dld_name.toLowerCase(),
        90,
      ).catch(() => null)
    : null;

  // Lifestyle score (metro / mall / landmark) — soft-fail when not computed
  // for this area (typically because the rent stream has no nearest_*
  // values for it).
  const lifestyle = area.dld?.dld_name
    ? await getDldAreaLifestyleScore(area.dld.dld_name.toLowerCase()).catch(
        () => null,
      )
    : null;

  // Building-category breakdown from the synthetic dim. Soft-fail when the
  // area has no rents under its name_norm (typically tower-density
  // communities that DLD files under master_project_en).
  const categoryBreakdown = area.dld?.dld_name
    ? await getDldAreaCategoryBreakdown(
        area.dld.dld_name.toLowerCase(),
      ).catch(() => null)
    : null;

  // Off-plan projects under construction in this area. Hidden when the
  // area has no master_project_en rows tagged off-plan in the
  // transactions stream.
  const activeDevelopment = area.dld?.dld_name
    ? await getOffplanProjects({
        area_slug: area.dld.dld_name.toLowerCase().replace(/\s+/g, '-'),
        sort: 'units',
        limit: 8,
      }).catch(() => null)
    : null;

  const typeLabel = TYPE_LABEL[area.area_type] ?? area.area_type;
  const hasCoords = area.latitude != null && area.longitude != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${area.latitude},${area.longitude}`
    : null;

  const summary = area.latest
    ? buildInvestmentSummary(area.name, {
        rental_yield: area.latest.rental_yield,
        appreciation_1y: area.latest.appreciation_1y,
        appreciation_3y: area.latest.appreciation_3y,
        risk_score: area.latest.risk_score,
        demand_score: area.latest.demand_score,
        investment_score: area.latest.investment_score,
        occupancy_rate: area.latest.occupancy_rate,
        avg_price_per_sqft: area.latest.avg_price_per_sqft,
      })
    : null;
  const risk = area.latest ? interpretRisk(area.latest.risk_score) : null;
  const opp = area.latest
    ? describeOpportunity({
        rental_yield: area.latest.rental_yield,
        appreciation_1y: area.latest.appreciation_1y,
        appreciation_3y: area.latest.appreciation_3y,
        risk_score: area.latest.risk_score,
        demand_score: area.latest.demand_score,
        investment_score: area.latest.investment_score,
        occupancy_rate: area.latest.occupancy_rate,
        avg_price_per_sqft: area.latest.avg_price_per_sqft,
      })
    : null;

  return (
    <div className="bg-bg">
      {/* Header */}
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-4">
            <Breadcrumbs
              items={[
                { label: 'Areas', href: '/areas' },
                { label: area.name },
              ]}
            />
            <div className="mt-3 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold tracking-tight text-fg">
                    {area.name}
                  </h1>
                  <span className="pill">{typeLabel}</span>
                  {area.name_arabic && (
                    <span className="text-sm text-fg-muted" dir="rtl">
                      {area.name_arabic}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
                  <MapPin className="h-3 w-3" strokeWidth={2} />
                  {area.city}, {area.emirate}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/compare?ids=${area.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
                >
                  <GitCompare className="h-3.5 w-3.5" strokeWidth={2} />
                  Compare
                </Link>
                <Link
                  href="/roi-calculator"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors"
                >
                  <Calculator className="h-3.5 w-3.5" strokeWidth={2} />
                  Calculate ROI
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* KPI strip */}
      {area.latest && (
        <div className="border-b border-border bg-bg-card/30">
          <Container>
            <div className="flex overflow-x-auto snap-x scrollbar-thin -mx-4 sm:mx-0">
              <MetricTile
                label="AED / sqft"
                value={formatNumber(area.latest.avg_price_per_sqft, 0)}
                mono
              />
              <MetricTile
                label="Rental Yield"
                value={formatPercent(area.latest.rental_yield, 2)}
                mono
              />
              <MetricTile
                label="1Y Appreciation"
                value={
                  <DataBadge
                    value={area.latest.appreciation_1y}
                    format="percent"
                    precision={2}
                  />
                }
              />
              <MetricTile
                label="3Y Appreciation"
                value={
                  <DataBadge
                    value={area.latest.appreciation_3y}
                    format="percent"
                    precision={2}
                  />
                }
              />
              <MetricTile
                label="Occupancy"
                value={
                  area.latest.occupancy_rate != null
                    ? formatPercent(area.latest.occupancy_rate, 1)
                    : '—'
                }
                mono
              />
              <MetricTile
                label="Score"
                value={
                  area.latest.investment_score != null
                    ? `${area.latest.investment_score.toFixed(1)}/10`
                    : '—'
                }
                mono
              />
            </div>
          </Container>
        </div>
      )}

      {/* Tab bar (anchor links) */}
      <div className="sticky top-14 z-20 border-b border-border bg-bg/95 backdrop-blur-md">
        <Container>
          <div className="flex items-center gap-1 text-xs overflow-x-auto scrollbar-thin">
            <a
              href="#ai-insights"
              className="px-3 py-3 border-b-2 border-accent text-fg font-medium inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Sparkles className="h-3 w-3" strokeWidth={2} />
              AI Insights
            </a>
            <a
              href="#charts"
              className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors whitespace-nowrap"
            >
              Charts
            </a>
            <a
              href="#overview"
              className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors whitespace-nowrap"
            >
              Overview
            </a>
            <a
              href="#facts"
              className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors whitespace-nowrap"
            >
              Facts
            </a>
            {hasCoords && (
              <a
                href="#map"
                className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors whitespace-nowrap"
              >
                Map
              </a>
            )}
          </div>
        </Container>
      </div>

      <Container>
        {/* Low-confidence banner (only if low) */}
        {confidence && confidence.level === 'low' && (
          <div className="mt-5">
            <ConfidenceWarningBanner report={confidence} />
          </div>
        )}

        {/* Confidence summary */}
        {confidence && (
          <div className="mt-5">
            <ConfidenceBadge report={confidence} />
          </div>
        )}

        {/* Floxcy Insight — Investment Grade + Best For + Similar Areas */}
        {area.latest && (
          <div className="mt-5">
            <FloxcyInsight
              areaName={area.name}
              dldName={area.dld?.dld_name ?? area.name}
              metrics={{
                rental_yield: area.latest.rental_yield,
                appreciation_1y: area.latest.appreciation_1y,
                appreciation_3y: area.latest.appreciation_3y,
                avg_price_per_sqft: area.latest.avg_price_per_sqft,
                investment_score: area.latest.investment_score,
                risk_score: area.latest.risk_score,
              }}
            />
          </div>
        )}

        {/* DLD live-data overlay (Phase 3) */}
        {area.dld && (
          <section
            id="dld-overlay"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                Dubai Land Department · live benchmark
              </span>
              <span className="text-[11px] text-fg-subtle">
                {area.dld.sales_count.toLocaleString()} sales ·{' '}
                {area.dld.rent_count_2026.toLocaleString()} rents · confidence{' '}
                <span
                  className={cn(
                    'font-medium',
                    area.dld.confidence === 'high' && 'text-positive',
                    area.dld.confidence === 'medium' && 'text-accent',
                    area.dld.confidence === 'low' && 'text-fg-muted'
                  )}
                >
                  {area.dld.confidence}
                </span>
              </span>
            </div>
            <div className="grid gap-px bg-border lg:grid-cols-4">
              <MetricTile
                label="Median price / sqft"
                value={
                  area.dld.median_price_per_sqft
                    ? formatAED(area.dld.median_price_per_sqft)
                    : '—'
                }
                hint="DLD 2026 YTD"
                mono
              />
              <MetricTile
                label="Median annual rent"
                value={
                  area.dld.median_annual_rent
                    ? formatAED(area.dld.median_annual_rent)
                    : '—'
                }
                hint="DLD 2026 YTD"
                mono
              />
              <MetricTile
                label="Rental yield"
                value={
                  area.dld.rental_yield_pct != null
                    ? formatPercent(area.dld.rental_yield_pct)
                    : '—'
                }
                hint={
                  area.dld.rental_yield_pct == null
                    ? 'Needs ≥30 sales & ≥30 rents'
                    : 'Capped at 25%'
                }
                tone={area.dld.rental_yield_pct != null ? 'positive' : 'default'}
                mono
              />
              <MetricTile
                label="YoY rent growth"
                value={
                  area.dld.rent_growth_yoy_pct != null
                    ? `${area.dld.rent_growth_yoy_pct >= 0 ? '+' : ''}${area.dld.rent_growth_yoy_pct.toFixed(1)}%`
                    : '—'
                }
                hint="vs 2025"
                tone={
                  area.dld.rent_growth_yoy_pct == null
                    ? 'default'
                    : area.dld.rent_growth_yoy_pct >= 0
                      ? 'positive'
                      : 'negative'
                }
                mono
              />
            </div>
            {/* Land registry overlay — freehold + land-type mix */}
            {(area.dld.freehold_pct != null || area.dld.land_type_mix) && (
              <div className="grid gap-px bg-border border-t border-border lg:grid-cols-3">
                {area.dld.freehold_pct != null && (
                  <MetricTile
                    label="Freehold parcels"
                    value={`${area.dld.freehold_pct.toFixed(1)}%`}
                    hint={
                      area.dld.total_parcels != null
                        ? `of ${area.dld.total_parcels.toLocaleString()} registered parcels`
                        : 'DLD land registry'
                    }
                    tone={
                      area.dld.freehold_pct >= 80
                        ? 'positive'
                        : area.dld.freehold_pct >= 30
                          ? 'default'
                          : 'negative'
                    }
                    mono
                  />
                )}
                {area.dld.land_type_mix && (() => {
                  const mix = area.dld.land_type_mix;
                  const sorted = Object.entries(mix)
                    .filter(([k, v]) => k && k !== 'null' && typeof v === 'number')
                    .sort(([, a], [, b]) => (b as number) - (a as number));
                  const top = sorted[0];
                  return top ? (
                    <MetricTile
                      label="Land use (dominant)"
                      value={`${(top[1] as number).toFixed(0)}% ${top[0]}`}
                      hint={
                        sorted.length > 1
                          ? `${(sorted[1][1] as number).toFixed(0)}% ${sorted[1][0]}` +
                            (sorted.length > 2 ? ` · ${(sorted[2][1] as number).toFixed(0)}% ${sorted[2][0]}` : '')
                          : 'land-type mix'
                      }
                      mono
                    />
                  ) : null;
                })()}
                {area.dld.registered_pct != null && (
                  <MetricTile
                    label="Registered parcels"
                    value={`${area.dld.registered_pct.toFixed(1)}%`}
                    hint="DLD registration status"
                    tone={area.dld.registered_pct >= 95 ? 'positive' : 'default'}
                    mono
                  />
                )}
              </div>
            )}
            <div className="px-4 py-2 text-[11px] text-fg-subtle border-t border-border">
              Source: {area.data_source ?? 'Dubai Land Department Open Data'}.
              Updated {area.last_updated ?? '2026-06-01'}. Mapped DLD area:{' '}
              <span className="font-mono text-fg">{area.dld.dld_name}</span>.
            </div>
          </section>
        )}

        {/* Price History (2021–2026) — DLD historical Sales-of-Unit */}
        {priceHistory && priceHistory.points.length >= 2 && (
          <section
            id="price-history"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                Price History · {priceHistory.area_name_display} · 2021–2026
              </span>
              <span className="text-[11px] text-fg-subtle">
                {priceHistory.years_of_history} years · DLD Sales-of-Unit
              </span>
            </div>
            {/* 4-tile appreciation strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
              <MetricTile
                label="5-year growth"
                value={
                  priceHistory.appreciation_5y_pct != null
                    ? `${priceHistory.appreciation_5y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_5y_pct.toFixed(1)}%`
                    : '—'
                }
                hint="2021 → 2026"
                tone={
                  priceHistory.appreciation_5y_pct == null
                    ? 'default'
                    : priceHistory.appreciation_5y_pct >= 0
                      ? 'positive'
                      : 'negative'
                }
                mono
              />
              <MetricTile
                label="Annual growth rate"
                value={
                  priceHistory.cagr_5y_pct != null
                    ? `${priceHistory.cagr_5y_pct >= 0 ? '+' : ''}${priceHistory.cagr_5y_pct.toFixed(2)}%`
                    : '—'
                }
                hint="5y CAGR"
                tone={
                  priceHistory.cagr_5y_pct == null
                    ? 'default'
                    : priceHistory.cagr_5y_pct >= 0
                      ? 'positive'
                      : 'negative'
                }
                mono
              />
              <MetricTile
                label="3-year growth"
                value={
                  priceHistory.appreciation_3y_pct != null
                    ? `${priceHistory.appreciation_3y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_3y_pct.toFixed(1)}%`
                    : '—'
                }
                hint="2023 → 2026"
                mono
              />
              <MetricTile
                label="Last year"
                value={
                  priceHistory.appreciation_1y_pct != null
                    ? `${priceHistory.appreciation_1y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_1y_pct.toFixed(1)}%`
                    : '—'
                }
                hint="2025 → 2026"
                mono
              />
            </div>
            {/* Line chart — prefer ready-only series; fall back to all-units */}
            <div className="p-4 sm:p-5">
              <PriceTrend
                data={priceHistory.points.map((p) => ({
                  label: String(p.year),
                  price:
                    (p.avg_ppsf_ready ?? p.avg_ppsf) != null
                      ? Math.round(p.avg_ppsf_ready ?? p.avg_ppsf!)
                      : undefined,
                }))}
                height={220}
                showYield={false}
              />
              <p className="mt-2 text-[10px] text-fg-subtle">
                Series: average AED/sqft per year, ready stock preferred
                (off-plan launches blended only when no ready trades
                cleared). Source: DLD registered Sales-of-Unit transactions
                2021–2026.
              </p>
            </div>
          </section>
        )}

        {/* Rent & Yield History (2021-2026) — DLD Ejari + derived yield */}
        {yieldHistory && yieldHistory.points.filter(p => p.gross_yield_pct != null).length >= 2 && (() => {
          const validYields = yieldHistory.points.filter(p => p.gross_yield_pct != null);
          const startYield = validYields[0].gross_yield_pct!;
          const endYield = validYields[validYields.length - 1].gross_yield_pct!;
          const yieldDeltaPp = endYield - startYield;
          const trendBadge =
            yieldHistory.trend === 'rising'
              ? { emoji: '🟢', label: 'Rising', tone: 'positive' as const }
              : yieldHistory.trend === 'falling'
                ? { emoji: '🔴', label: 'Falling', tone: 'negative' as const }
                : { emoji: '🟡', label: 'Flat', tone: 'default' as const };
          const compressionPhrase =
            Math.abs(yieldDeltaPp) < 0.25
              ? `Yields held flat ${validYields[0].year}→${validYields[validYields.length - 1].year}`
              : yieldDeltaPp < 0
                ? `Yields compressed ${Math.abs(yieldDeltaPp).toFixed(2)}pp since ${validYields[0].year} — prices outran rents.`
                : `Yields expanded ${yieldDeltaPp.toFixed(2)}pp since ${validYields[0].year} — rents outran prices.`;
          // Find latest rent point for tile
          const latestRent = rentHistory?.points[rentHistory.points.length - 1] ?? null;
          return (
            <section
              id="rent-yield-history"
              className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
            >
              <div className="chart-header">
                <span className="chart-header-label inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                  Rent & Yield History · {yieldHistory.area_name_display} · 2021–2026
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    trendBadge.tone === 'positive' && 'bg-positive/15 text-positive',
                    trendBadge.tone === 'negative' && 'bg-negative/15 text-negative',
                    trendBadge.tone === 'default' && 'bg-warning/15 text-warning'
                  )}
                >
                  <span aria-hidden>{trendBadge.emoji}</span>
                  Yield {trendBadge.label}
                </span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
                <MetricTile
                  label="Latest gross yield"
                  value={
                    endYield >= 20
                      ? '≥20%'
                      : `${endYield.toFixed(2)}%`
                  }
                  hint={`${validYields[validYields.length - 1].year} · sample ${validYields[validYields.length - 1].sample_score}`}
                  tone="positive"
                  mono
                />
                <MetricTile
                  label="Yield change since 2021"
                  value={
                    `${yieldDeltaPp >= 0 ? '+' : ''}${yieldDeltaPp.toFixed(2)}pp`
                  }
                  hint={trendBadge.label.toLowerCase()}
                  tone={
                    yieldDeltaPp > 0.25
                      ? 'positive'
                      : yieldDeltaPp < -0.25
                        ? 'negative'
                        : 'default'
                  }
                  mono
                />
                <MetricTile
                  label="Latest avg rent/sqft"
                  value={
                    latestRent?.avg_rent_per_sqft != null
                      ? `AED ${formatNumber(latestRent.avg_rent_per_sqft, 0)}`
                      : '—'
                  }
                  hint="DLD Ejari"
                  mono
                />
                <MetricTile
                  label="Latest avg annual rent"
                  value={
                    latestRent?.avg_annual_rent != null
                      ? formatAED(latestRent.avg_annual_rent)
                      : '—'
                  }
                  hint={
                    latestRent != null
                      ? `${latestRent.contract_count.toLocaleString()} contracts`
                      : '—'
                  }
                  mono
                />
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-sm text-fg mb-3">{compressionPhrase}</p>
                <PriceTrend
                  data={yieldHistory.points.map((p) => ({
                    label: String(p.year),
                    yield:
                      p.gross_yield_pct != null
                        ? Math.min(p.gross_yield_pct, 20)
                        : undefined,
                  }))}
                  height={220}
                  showYield={true}
                />
                <p className="mt-2 text-[10px] text-fg-subtle">
                  Series: gross yield = avg rent/sqft ÷ avg sale PPSF × 100,
                  display-capped at 20%. Source: DLD Ejari rents + registered
                  Sales-of-Unit, 2021–2026.
                </p>
              </div>
            </section>
          );
        })()}

        {/* Property breakdown — rolled up into the 4 Property Intelligence
            buckets (Buildings / Villas / Communities / Commercial). Each
            tile deep-links into /buildings with the matching tab + area
            pre-filtered. */}
        {categoryBreakdown && categoryBreakdown.total_buildings > 0 && (() => {
          const areaSlug = area.dld?.dld_name?.toLowerCase() ?? '';
          const buckets: Array<{
            key: 'buildings' | 'villas' | 'commercial';
            emoji: string;
            label: string;
            cats: string[];
          }> = [
            { key: 'buildings',  emoji: '🏢', label: 'Buildings',  cats: ['apartment', 'hotel_apt'] },
            { key: 'villas',     emoji: '🏡', label: 'Villas',     cats: ['villa'] },
            { key: 'commercial', emoji: '🏬', label: 'Commercial', cats: ['office', 'retail', 'warehouse', 'labor_camp', 'whole_building', 'other'] },
          ];
          const tiles = buckets
            .map((b) => ({
              ...b,
              count: categoryBreakdown.items
                .filter((it) => b.cats.includes(it.property_category))
                .reduce((s, it) => s + it.building_count, 0),
            }))
            .filter((b) => b.count > 0);
          if (tiles.length === 0) return null;
          return (
            <section
              id="category-breakdown"
              className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
            >
              <div className="chart-header">
                <span className="chart-header-label">Property Breakdown</span>
                <span className="text-[11px] text-fg-subtle">
                  {categoryBreakdown.total_buildings.toLocaleString()} properties total
                </span>
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-2 md:grid-cols-4">
                {tiles.map((t) => (
                  <Link
                    key={t.key}
                    href={`/buildings?tab=${t.key}&area=${encodeURIComponent(areaSlug)}`}
                    className="bg-bg-card p-3 hover:bg-bg-elev/40"
                  >
                    <div className="flex items-baseline gap-2">
                      <span aria-hidden className="text-base">{t.emoji}</span>
                      <span className="text-2xl font-mono text-fg">
                        {t.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-fg-muted">{t.label}</div>
                  </Link>
                ))}
                <Link
                  href={`/buildings?tab=communities&area=${encodeURIComponent(areaSlug)}`}
                  className="bg-bg-card p-3 hover:bg-bg-elev/40"
                >
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden className="text-base">🏘️</span>
                    <span className="text-2xl font-mono text-fg">→</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-muted">Communities</div>
                </Link>
              </div>
              <div className="px-4 py-2 text-[10px] text-fg-subtle border-t border-border">
                Rolled up from the synthetic building dim (dld_buildings_derived)
                built from DLD Ejari rent contracts 2021–2026. Click any tile to
                filter Property Intelligence by this area.
              </div>
            </section>
          );
        })()}

        {/* Lifestyle scores — metro / mall / landmark derived from rent stream */}
        {lifestyle && lifestyle.overall_score != null && (
          <section
            id="lifestyle"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label">
                Lifestyle scores
              </span>
              <span className="text-[11px] text-fg-subtle">
                Overall: <span className="font-mono text-fg">{lifestyle.overall_score.toFixed(1)}/10</span>
              </span>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <div className="bg-bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle">
                  🚇 Metro access
                </div>
                <div className="mt-1 text-2xl font-mono text-fg">
                  {(lifestyle.metro_score ?? 0).toFixed(1)}<span className="text-fg-subtle text-sm">/10</span>
                </div>
                <div className="mt-1 text-[11px] text-fg-muted">
                  {lifestyle.nearest_metro ?? '—'}
                  {lifestyle.metro_stations_count > 0 && (
                    <> · <span className="font-mono">{lifestyle.metro_stations_count}</span> stations</>
                  )}
                </div>
              </div>
              <div className="bg-bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle">
                  🛒 Retail
                </div>
                <div className="mt-1 text-2xl font-mono text-fg">
                  {(lifestyle.mall_score ?? 0).toFixed(1)}<span className="text-fg-subtle text-sm">/10</span>
                </div>
                <div className="mt-1 text-[11px] text-fg-muted">
                  {lifestyle.nearest_mall ?? '—'}
                </div>
              </div>
              <div className="bg-bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle">
                  📍 Landmarks
                </div>
                <div className="mt-1 text-2xl font-mono text-fg">
                  {(lifestyle.landmark_score ?? 0).toFixed(1)}<span className="text-fg-subtle text-sm">/10</span>
                </div>
                <div className="mt-1 text-[11px] text-fg-muted">
                  {lifestyle.nearest_landmark ?? '—'}
                </div>
              </div>
            </div>
            <div className="px-4 py-2 text-[10px] text-fg-subtle border-t border-border">
              Derived from the most-frequent nearest_* values in DLD Ejari
              contracts for this area. Metro score uses distinct stations
              (≥10 contracts each).
            </div>
          </section>
        )}

        {/* Active development — off-plan projects from /api/v1/offplan */}
        {activeDevelopment && activeDevelopment.items.length > 0 && (
          <section
            id="active-development"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                🏗️ Active development in this area
              </span>
              <Link
                href={`/offplan?area_slug=${area.dld?.dld_name?.toLowerCase().replace(/\s+/g, '-') ?? ''}`}
                className="text-[11px] text-accent hover:underline"
              >
                See all
              </Link>
            </div>
            <div className="px-4 py-3 text-[11px] text-fg-muted border-b border-border">
              {activeDevelopment.total} projects with at least one under-construction building under their master plan.
            </div>
            <ul className="divide-y divide-border">
              {activeDevelopment.items.slice(0, 8).map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/offplan/${p.slug}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-bg-elev/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-fg truncate">
                        {p.master_project}
                      </div>
                      <div className="text-[11px] text-fg-subtle">
                        {p.developer_name} · {p.offplan_buildings} under construction · {p.ready_buildings} ready
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] tabular text-fg-muted">
                      {formatNumber(p.total_units)} units
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Upcoming availability (next 90 days) — from Availability Tracker */}
        {upcomingAvailability && upcomingAvailability.total_expiring > 0 && (
          <section
            id="upcoming-availability"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                Upcoming availability ·{' '}
                {upcomingAvailability.window_days} days
              </span>
              <span className="text-[11px] text-fg-subtle">
                horizon: {upcomingAvailability.horizon_month_end}
              </span>
            </div>
            <div className="px-4 py-3 text-[11px] text-fg-muted border-b border-border">
              {upcomingAvailability.total_expiring.toLocaleString()} Person
              residential contracts expire by{' '}
              {upcomingAvailability.horizon_month_end} — roughly{' '}
              <span className="text-fg font-mono">
                {upcomingAvailability.total_estimated_available.toLocaleString()}
              </span>{' '}
              units likely to come back on the market (39% non-renewal blend).
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-fg-subtle border-b border-border bg-bg-elev/40">
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Expiring</th>
                    <th className="py-2 px-3 font-medium">Est. available</th>
                    <th className="py-2 px-3 font-medium">Avg last rent</th>
                    <th className="py-2 px-3 font-medium">Renewal prob.</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingAvailability.by_sub_type.map((it) => (
                    <tr
                      key={it.property_sub_type}
                      className="border-b border-border/40"
                    >
                      <td className="py-2 px-3 font-medium text-fg">
                        {it.property_sub_type}
                      </td>
                      <td className="py-2 px-3 font-mono text-fg">
                        {it.contract_count.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-mono text-accent">
                        {it.estimated_available.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-mono text-fg-muted">
                        {it.avg_last_rent != null
                          ? `AED ${Math.round(it.avg_last_rent).toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-fg-muted">
                        {it.renewal_probability_pct != null
                          ? `${it.renewal_probability_pct.toFixed(0)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[10px] text-fg-subtle border-t border-border">
              Source: DLD Ejari lease end dates. Estimated availability uses a
              blended 39% non-renewal rate; per-row renewal probability blends
              historical Person+Renew (61%) vs Person+New (45%).
            </div>
          </section>
        )}

        {/* Top buildings in this area — Building X-Ray integration */}
        {topBuildings && topBuildings.items.length > 0 && (
          <section
            id="top-buildings"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                Top buildings in {topBuildings.area_name} · DLD Ejari
              </span>
              <Link
                href={`/buildings?area=${encodeURIComponent(area.dld?.dld_name?.toLowerCase() ?? '')}`}
                className="text-[11px] font-medium text-accent hover:text-accent/80"
              >
                See all →
              </Link>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
              {topBuildings.items.map((b) => (
                <Link
                  key={b.id}
                  href={`/buildings/${b.id}`}
                  className="bg-bg-card p-3 hover:bg-bg-elev/40 transition-colors min-h-[88px]"
                >
                  <div className="text-sm font-medium text-fg truncate">
                    {b.project_name ?? '—'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">
                    {b.active_rent_count.toLocaleString()} active rents
                    {b.prop_sub_type ? ` · ${b.prop_sub_type}` : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-fg-muted">
                    Income:{' '}
                    <span className="text-fg">{b.income_range_label ?? '—'}</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="px-4 py-2 text-[10px] text-fg-subtle border-t border-border">
              Source: Dubai Land Department · Ejari rent contract registry.
            </div>
          </section>
        )}

        {/* Honest empty-state: API succeeded but no buildings linked. Happens
            for tower-density communities (Business Bay, Marina, Downtown)
            where DLD doesn't publish building-level data. */}
        {topBuildings && topBuildings.items.length === 0 && (
          <section
            id="top-buildings-empty"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
                Building X-Ray · {topBuildings.area_name}
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-sm text-fg-muted leading-relaxed">
                <span className="text-fg font-medium">
                  {topBuildings.area_name}
                </span>{' '}
                is mostly individual strata towers, not a master-planned
                community. Dubai Land Department publishes building-level
                rent data only for master-planned projects (Damac Hills,
                Arabian Ranches, Town Square, Dubai South, JVC, etc.).
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Link
                  href="/buildings"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20"
                >
                  Browse 8,075 covered buildings →
                </Link>
                <span className="text-[11px] text-fg-subtle">
                  Source: DLD Ejari rent contract registry
                </span>
              </div>
            </div>
          </section>
        )}

        {/* AI insight card (P2) */}
        <div className="mt-5">
          <AreaAiInsightCard areaId={params.id} />
        </div>

        {/* Undervaluation block (killer feature inline on area detail) */}
        {undervaluation && (
          <section
            id="undervaluation"
            className="mt-5 border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
          >
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                Opportunity classification
              </span>
              <Link
                href="/opportunities"
                className="text-[11px] font-medium text-accent hover:text-accent/80"
              >
                vs all 70 areas →
              </Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-border">
              <div className="lg:col-span-7 bg-bg-card p-5">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="text-4xl font-semibold tabular text-fg">
                    {undervaluation.opportunity_score}
                    <span className="text-base font-normal text-fg-subtle">/100</span>
                  </div>
                  <span
                    className={cn(
                      'pill text-sm',
                      TYPE_TONE[undervaluation.opportunity_type] ?? ''
                    )}
                  >
                    {undervaluation.opportunity_type}
                  </span>
                  <span className="pill">
                    Confidence: {(undervaluation.confidence_level * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                      Why
                    </div>
                    <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
                      {undervaluation.why.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-positive" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                      Risks
                    </div>
                    <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
                      {undervaluation.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-negative" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                      Best for
                    </div>
                    <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                      {undervaluation.best_for}
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                      Strategy
                    </div>
                    <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                      {undervaluation.strategy}
                    </p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 bg-bg-card p-5">
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" strokeWidth={2} />
                  Nearby — 3 closest
                </div>
                <table className="data-table mt-2">
                  <tbody>
                    {(undervaluation.nearby_comparison ?? []).map((n) => (
                      <tr key={n.area_id}>
                        <td>
                          <Link
                            href={`/areas/${n.area_id}`}
                            className="text-fg hover:text-accent text-xs"
                          >
                            {n.area_name}
                          </Link>
                          <div className="text-[10px] text-fg-subtle tabular">
                            {n.distance_km.toFixed(1)} km ·{' '}
                            {formatNumber(n.price_per_sqft, 0)} AED/sqft ·{' '}
                            {formatPercent(n.rental_yield, 1)}
                          </div>
                        </td>
                        <td className="num">
                          <span
                            className={cn(
                              'pill',
                              TYPE_TONE[n.opportunity_type] ?? ''
                            )}
                            title={n.opportunity_type}
                          >
                            {n.opportunity_score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(undervaluation.nearby_comparison ?? []).length === 0 && (
                  <p className="mt-2 text-[11px] text-fg-subtle">
                    No comparable areas with coordinates yet.
                  </p>
                )}
              </div>
            </div>
            <div className="border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
              See{' '}
              <Link href="/methodology" className="text-accent hover:underline">
                methodology
              </Link>{' '}
              for the full scoring formula. Not investment advice.
            </div>
          </section>
        )}

        {/* AI Insights panel */}
        {summary && opp && risk && (
          <section id="ai-insights" className="scroll-mt-28 mt-6">
            <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
              <div className="chart-header">
                <span className="chart-header-label inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                  AI Investment Analysis
                </span>
                <span className="text-[11px] text-fg-subtle tabular">
                  Generated · {new Date().toISOString().slice(0, 10)}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-border">
                {/* Summary */}
                <div className="bg-bg-card p-5 lg:col-span-7">
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'pill mt-0.5',
                        opp.tier === 'standout' && 'pill-positive',
                        opp.tier === 'strong' && 'pill-accent',
                        opp.tier === 'fair' && 'pill',
                        opp.tier === 'soft' && 'pill-negative'
                      )}
                    >
                      {opp.label}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-fg leading-tight">
                    {summary.headline}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {summary.body}
                  </p>
                  <ul className="mt-4 space-y-1.5 text-xs">
                    {summary.bullets.map((b, i) => (
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
                {/* Risk + Opportunity panels */}
                <div className="lg:col-span-5 grid grid-cols-1 divide-y divide-border bg-bg-card">
                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      <ShieldAlert
                        className={cn(
                          'h-3.5 w-3.5',
                          risk.tier === 'low' && 'text-positive',
                          risk.tier === 'moderate' && 'text-fg-muted',
                          risk.tier === 'elevated' && 'text-warning',
                          risk.tier === 'high' && 'text-negative'
                        )}
                        strokeWidth={2}
                      />
                      <span className="chart-header-label">
                        Risk Interpretation
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        className={cn(
                          'text-base font-semibold',
                          risk.tier === 'low' && 'text-positive',
                          risk.tier === 'moderate' && 'text-fg',
                          risk.tier === 'elevated' && 'text-warning',
                          risk.tier === 'high' && 'text-negative'
                        )}
                      >
                        {risk.label}
                      </span>
                      {risk.score != null && (
                        <span className="text-xs tabular text-fg-subtle">
                          {risk.score.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
                      {risk.rationale}
                    </p>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      <Target className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                      <span className="chart-header-label">
                        Opportunity Drivers
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                      {opp.rationale}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border-t border-border bg-bg-elev/30 px-5 py-2.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                <Info className="h-3 w-3" strokeWidth={2} />
                <span>
                  Analysis is rules-derived from latest market snapshot. Not
                  investment advice. Methodology v0.1.
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Chart */}
        {area.history && area.history.length > 1 && (
          <section id="charts" className="scroll-mt-28 mt-6">
            <div className="border border-border rounded-lg overflow-hidden bg-bg-card">
              <div className="chart-header">
                <span className="chart-header-label">
                  Price &amp; Yield · 12-month history
                </span>
                <span className="text-[11px] text-fg-subtle tabular">
                  {area.history.length} snapshots
                </span>
              </div>
              <div className="p-4">
                <PriceTrend
                  data={area.history.map((h) => ({
                    label: h.snapshot_date.slice(0, 7),
                    price: h.avg_price_per_sqft,
                    yield: h.rental_yield,
                  }))}
                  height={320}
                />
              </div>
            </div>
          </section>
        )}

        <section id="overview" className="scroll-mt-28 mt-6 grid gap-px bg-border border border-border rounded-lg overflow-hidden lg:grid-cols-3 mb-6">
          <div className="bg-bg-card p-5 lg:col-span-2">
            <div className="chart-header-label">About this area</div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg">
              {area.description ?? 'No description available for this area yet.'}
            </p>
            {area.latest && (
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                <Field
                  label="Avg sale price"
                  value={formatAED(area.latest.avg_sale_price, { compact: true })}
                />
                <Field
                  label="Annual rent"
                  value={formatAED(area.latest.avg_annual_rent, { compact: true })}
                />
                <Field
                  label="Occupancy"
                  value={
                    area.latest.occupancy_rate != null
                      ? formatPercent(area.latest.occupancy_rate)
                      : '—'
                  }
                />
                <Field
                  label="Demand score"
                  value={
                    area.latest.demand_score != null
                      ? `${area.latest.demand_score.toFixed(1)}/10`
                      : '—'
                  }
                />
                <Field
                  label="Risk score"
                  value={
                    area.latest.risk_score != null
                      ? `${area.latest.risk_score.toFixed(1)}/10`
                      : '—'
                  }
                />
                <Field
                  label="Transaction volume"
                  value={
                    area.latest.transaction_volume != null
                      ? formatNumber(area.latest.transaction_volume)
                      : '—'
                  }
                />
              </dl>
            )}
          </div>

          <div id="facts" className="bg-bg-card p-5 scroll-mt-28">
            <div className="chart-header-label">Quick facts</div>
            <dl className="mt-3 space-y-3 text-sm">
              <Field label="Type" value={typeLabel} />
              <Field label="City" value={area.city} />
              <Field label="Emirate" value={area.emirate} />
              {area.name_arabic && (
                <Field
                  label="Arabic"
                  value={
                    <span dir="rtl" className="text-fg">
                      {area.name_arabic}
                    </span>
                  }
                />
              )}
              {hasCoords && (
                <Field
                  label="Coordinates"
                  value={
                    <span className="tabular">
                      {area.latitude!.toFixed(4)}, {area.longitude!.toFixed(4)}
                    </span>
                  }
                />
              )}
            </dl>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                id="map"
                className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-elev/60 px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors scroll-mt-28"
              >
                Open in Google Maps
                <ExternalLink className="h-3 w-3" strokeWidth={2} />
              </a>
            )}
          </div>
        </section>

        <div className="pb-10" />
      </Container>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-fg tabular">{value}</dd>
    </div>
  );
}
