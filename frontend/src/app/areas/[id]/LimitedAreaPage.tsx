/**
 * Limited-data area page — rendered when /areas/[slug] resolves to a
 * DLD-only area (no curated MarketSnapshot history). Shows whatever DLD
 * data IS available + a clear "Data coming soon" panel for what isn't,
 * plus the area's top buildings if the alias layer can find any.
 *
 * Kept as a server component so it can be statically rendered and so the
 * Building X-Ray data is fetched server-side alongside the area data.
 */
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Database,
  ExternalLink,
  Info,
  MapPin,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { MetricTile } from '@/components/data/MetricTile';
import { getDldAreaTopBuildings, getDldAreaPriceHistory, getServiceCharges } from '@/lib/api';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import type { AreaLimitedDetail, ServiceChargeArea } from '@/lib/types';
import { cn } from '@/lib/cn';
import { AreaPriceHistorySection } from './AreaPriceHistorySection';
import { NetYieldBlock } from '@/components/NetYieldBlock';

export async function LimitedAreaPage({ area }: { area: AreaLimitedDetail }) {
  // The /dld/areas/{name_norm}/top-buildings endpoint handles aliases and
  // tower-density empty-states; here we just consume whatever it returns.
  // Price history fetch runs in parallel; AreaPriceHistorySection soft-fails
  // (renders nothing) when the area has no qualifying Sales-of-Unit rows.
  // Query the cadastral twin (history_name_norm) for history/buildings when the
  // displayed area is a marketing name; fall back to its own DLD name.
  const histName = (
    area.dld.history_name_norm ?? area.dld.dld_name
  ).toLowerCase();
  const [topBuildings, priceHistory, serviceCharges] = await Promise.all([
    getDldAreaTopBuildings(histName, 6).catch(() => null),
    getDldAreaPriceHistory(histName).catch(() => null),
    getServiceCharges().catch(() => null),
  ]);
  const serviceArea: ServiceChargeArea | null =
    serviceCharges?.areas.find((a) => a.name_norm === histName) ?? null;

  const d = area.dld;
  const isEmpty = area.coverage_tier === 'none';
  // Name-based Google Maps URL — same pattern as the curated page so users
  // get a labelled pin ("Al Bastakiyah, Dubai") instead of a raw lat,lon.
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(area.name + ' Dubai UAE')}`;

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[{ label: 'Areas', href: '/areas' }, { label: area.name }]}
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-fg tracking-tight truncate">
                  {area.name}
                </h1>
                <p className="mt-1 text-xs text-fg-muted">
                  Dubai · DLD-tracked area
                  {area.coverage_tier === 'limited' && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
                      <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />
                      Limited data
                    </span>
                  )}
                  {isEmpty && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-fg-subtle">
                      <Database className="h-3 w-3" strokeWidth={2.5} />
                      Data coming soon
                    </span>
                  )}
                </p>
                <div className="mt-2">
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`Open ${area.name} on Google Maps`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-card px-2.5 text-[11px] font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
                  >
                    <MapPin className="h-3 w-3" strokeWidth={2.5} />
                    Open in Google Maps
                    <ExternalLink className="h-3 w-3" strokeWidth={2} />
                  </a>
                </div>
              </div>
              <div className="text-left sm:text-right text-[11px] text-fg-subtle">
                <div>
                  <span className="text-fg-muted">Source:</span>{' '}
                  {area.data_source}
                </div>
                <div>
                  <span className="text-fg-muted">Updated:</span>{' '}
                  {area.last_updated}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4 sm:py-6 space-y-5">
          {/* Coming-soon notice for areas with no metrics */}
          {isEmpty && (
            <section className="card p-5 border-2 border-warning/30">
              <div className="flex items-start gap-3">
                <span aria-hidden className="text-xl leading-none">⚠️</span>
                <div>
                  <h2 className="text-sm font-semibold text-warning">
                    Data coming soon for {area.name}
                  </h2>
                  <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                    The Dubai Land Department lists this area but hasn&apos;t
                    published transaction or rent contract data for 2026 yet.
                    We&apos;ll backfill metrics on the next DLD snapshot
                    refresh.
                  </p>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Link
                      href="/areas"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 text-[11px] font-medium text-accent hover:bg-accent/20"
                    >
                      Browse areas with full data
                      <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                    </Link>
                    <Link
                      href="/rent-check"
                      className="text-[11px] text-fg-subtle hover:text-fg"
                    >
                      or check a nearby rental →
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* DLD metrics — render whatever's available, dash whatever isn't */}
          {!isEmpty && (
            <section className="card overflow-hidden">
              <div className="chart-header">
                <span className="chart-header-label inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                  Dubai Land Department · live benchmark
                </span>
                <span className="text-[11px] text-fg-subtle">
                  {d.sales_count.toLocaleString()} sales ·{' '}
                  {d.rent_count_2026.toLocaleString()} rents · confidence{' '}
                  <span
                    className={cn(
                      'font-medium',
                      d.confidence === 'high' && 'text-positive',
                      d.confidence === 'medium' && 'text-accent',
                      d.confidence === 'low' && 'text-fg-muted'
                    )}
                  >
                    {d.confidence}
                  </span>
                </span>
              </div>
              <div className="grid gap-px bg-border lg:grid-cols-4">
                <MetricTile
                  label="Median price / sqft"
                  value={
                    d.median_price_per_sqft
                      ? formatAED(d.median_price_per_sqft)
                      : '—'
                  }
                  hint="DLD 2026 YTD"
                  mono
                />
                <MetricTile
                  label="Median annual rent"
                  value={
                    d.median_annual_rent
                      ? formatAED(d.median_annual_rent)
                      : '—'
                  }
                  hint="DLD 2026 YTD"
                  mono
                />
                <MetricTile
                  label="Rental yield"
                  value={
                    d.rental_yield_pct != null
                      ? formatPercent(d.rental_yield_pct)
                      : '—'
                  }
                  hint={
                    d.rental_yield_pct == null
                      ? 'Needs ≥30 sales & ≥30 rents'
                      : 'Capped at 25%'
                  }
                  tone={d.rental_yield_pct != null ? 'positive' : 'default'}
                  mono
                />
                <MetricTile
                  label="YoY rent growth"
                  value={
                    d.rent_growth_yoy_pct != null
                      ? `${d.rent_growth_yoy_pct >= 0 ? '+' : ''}${d.rent_growth_yoy_pct.toFixed(1)}%`
                      : '—'
                  }
                  hint="vs 2025"
                  tone={
                    d.rent_growth_yoy_pct == null
                      ? 'default'
                      : d.rent_growth_yoy_pct >= 0
                        ? 'positive'
                        : 'negative'
                  }
                  mono
                />
              </div>
              <div className="px-4 py-2 text-[11px] text-fg-subtle border-t border-border">
                {area.data_source} · last updated {area.last_updated}.
              </div>
            </section>
          )}

          {/* Long-term price history — only renders when we have ≥2 yearly
              points. Same component used by the curated detail page. */}
          <AreaPriceHistorySection priceHistory={priceHistory} />

          {d.rental_yield_pct != null && d.rental_yield_pct > 0 && (
            <div className="mt-5">
              <NetYieldBlock
                grossYield={d.rental_yield_pct}
                ppsf={d.median_price_per_sqft ?? serviceArea?.avg_ppsf}
                defaultRate={serviceArea?.service_rate}
                isVilla={(serviceArea?.villa_share ?? 0) > 0.5}
              />
            </div>
          )}

          {/* Why limited */}
          {!isEmpty && (
            <section className="card p-4 sm:p-5">
              <div className="flex items-start gap-2">
                <Database
                  className="h-4 w-4 text-fg-muted shrink-0 mt-0.5"
                  strokeWidth={2}
                />
                <div>
                  <h2 className="text-sm font-semibold text-fg">
                    Why is data limited?
                  </h2>
                  <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                    {area.name} isn&apos;t one of Floxcy&apos;s curated
                    investment-grade areas yet — so we don&apos;t have a hand-tuned
                    investment score, 1-year appreciation, or risk rating
                    here. The numbers above are the DLD figures we DO have;
                    nothing is fabricated. We add curated coverage based on
                    investor demand — drop us a note from{' '}
                    <Link
                      href="/consultation"
                      className="text-accent hover:underline"
                    >
                      /consultation
                    </Link>{' '}
                    if you&apos;d like this area prioritised.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Top buildings if any */}
          {topBuildings && topBuildings.items.length > 0 && (
            <section className="card overflow-hidden">
              <div className="chart-header">
                <span className="chart-header-label inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                  Top buildings in {topBuildings.area_name} · DLD Ejari
                </span>
                <Link
                  href={`/buildings?area=${encodeURIComponent(histName)}`}
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
                      <span className="text-fg">
                        {b.income_range_label ?? '—'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* CTAs */}
          <section className="card p-4 sm:p-5 border-2 border-accent/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
                  Want to invest in {area.name}?
                </h2>
                <p className="mt-1 text-xs text-fg-muted">
                  Browse our curated investment-grade areas or get matched with
                  a verified RERA broker.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/opportunities"
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90"
                >
                  Curated opportunities
                  <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                </Link>
                <Link
                  href="/brokers/directory"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg"
                >
                  Find a broker
                </Link>
              </div>
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}

// Silence unused-import warning — formatNumber kept for future enhancements
void formatNumber;
