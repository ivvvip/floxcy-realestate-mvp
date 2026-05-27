import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, ExternalLink, GitCompare, Calculator } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { MetricTile } from '@/components/data/MetricTile';
import { DataBadge } from '@/components/data/DataBadge';
import { ApiError, getArea } from '@/lib/api';
import { PriceTrend } from '@/components/charts/PriceTrend';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';

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

  const typeLabel = TYPE_LABEL[area.area_type] ?? area.area_type;
  const hasCoords = area.latitude != null && area.longitude != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${area.latitude},${area.longitude}`
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
          <div className="flex items-center gap-1 text-xs">
            <a
              href="#overview"
              className="px-3 py-3 border-b-2 border-accent text-fg font-medium"
            >
              Overview
            </a>
            <a
              href="#charts"
              className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors"
            >
              Charts
            </a>
            <a
              href="#facts"
              className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors"
            >
              Facts
            </a>
            {hasCoords && (
              <a
                href="#map"
                className="px-3 py-3 border-b-2 border-transparent text-fg-muted hover:text-fg transition-colors"
              >
                Map
              </a>
            )}
          </div>
        </Container>
      </div>

      <Container>
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
