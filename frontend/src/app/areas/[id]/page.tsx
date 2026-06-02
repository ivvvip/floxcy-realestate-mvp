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
import { ApiError, getArea, getAreaConfidence, getAreaUndervaluation, getDldAreaTopBuildings } from '@/lib/api';
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
    return {
      title: area.name,
      description:
        area.description ??
        `${area.name} — a curated investment area in ${area.city}, ${area.emirate}.`,
    };
  } catch {
    return { title: 'Area' };
  }
}

export default async function AreaDetailPage({ params }: AreaDetailProps) {
  let area;
  try {
    area = await getArea(params.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

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
            <div className="px-4 py-2 text-[11px] text-fg-subtle border-t border-border">
              Source: {area.data_source ?? 'Dubai Land Department Open Data'}.
              Updated {area.last_updated ?? '2026-06-01'}. Mapped DLD area:{' '}
              <span className="font-mono text-fg">{area.dld.dld_name}</span>.
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
