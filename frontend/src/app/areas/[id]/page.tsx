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
import { ApiError, getArea, getAreaConfidence } from '@/lib/api';
import { PriceTrend } from '@/components/charts/PriceTrend';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import {
  buildInvestmentSummary,
  interpretRisk,
  describeOpportunity,
} from '@/lib/insights';
import { cn } from '@/lib/cn';
import { ConfidenceBadge, ConfidenceWarningBanner } from '@/components/data/ConfidenceBadge';
import type { ConfidenceReport } from '@/lib/types';

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
  try {
    const c = await getAreaConfidence(params.id);
    confidence = c;
  } catch {
    confidence = null;
  }

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
