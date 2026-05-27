import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/Container';
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
    <Container>
      <div className="pt-10 sm:pt-14">
        <Link
          href="/areas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          All areas
        </Link>
      </div>

      <header className="relative overflow-hidden pt-8 pb-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="pill pill-accent">{typeLabel}</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              {area.name}
            </h1>
            {area.name_arabic && (
              <p
                className="mt-2 text-lg text-fg-muted"
                dir="rtl"
              >
                {area.name_arabic}
              </p>
            )}
            <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {area.city}, {area.emirate}
            </p>
          </div>

          <Link
            href="/roi-calculator"
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow transition-colors hover:bg-accent/90 sm:self-end"
          >
            Calculate ROI
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </header>

      {area.latest && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="Price / sqft"
            value={formatAED(area.latest.avg_price_per_sqft)}
            hint="Latest snapshot"
          />
          <MetricCard
            label="Rental yield"
            value={formatPercent(area.latest.rental_yield)}
            accent
          />
          <MetricCard
            label="1y appreciation"
            value={formatPercent(area.latest.appreciation_1y ?? 0)}
          />
          <MetricCard
            label="Investment score"
            value={`${area.latest.investment_score?.toFixed(1) ?? '—'}/10`}
            hint="Internal rating"
          />
        </div>
      )}

      {area.history && area.history.length > 1 && (
        <div className="surface-card mb-6 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            12-month price & yield
          </h2>
          <div className="mt-4">
            <PriceTrend
              data={area.history.map((h) => ({
                label: h.snapshot_date.slice(0, 7),
                price: h.avg_price_per_sqft,
                yield: h.rental_yield,
              }))}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 pb-20 lg:grid-cols-3">
        <div className="surface-card p-7 lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            About this area
          </h2>
          <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-fg">
            {area.description ?? 'No description available for this area yet.'}
          </p>
          {area.latest && (
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-fg-subtle">Avg sale price</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {formatAED(area.latest.avg_sale_price, { compact: true })}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Annual rent</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {formatAED(area.latest.avg_annual_rent, { compact: true })}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Occupancy</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {formatPercent(area.latest.occupancy_rate ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">3y appreciation</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {formatPercent(area.latest.appreciation_3y ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Demand score</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {area.latest.demand_score?.toFixed(1) ?? '—'}/10
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Risk score</dt>
                <dd className="mt-0.5 font-mono text-fg">
                  {area.latest.risk_score?.toFixed(1) ?? '—'}/10
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="surface-card p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Quick facts
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-fg-subtle">Type</dt>
                <dd className="mt-0.5 font-medium text-fg">{typeLabel}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">City</dt>
                <dd className="mt-0.5 font-medium text-fg">{area.city}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Emirate</dt>
                <dd className="mt-0.5 font-medium text-fg">{area.emirate}</dd>
              </div>
              {area.name_arabic && (
                <div>
                  <dt className="text-fg-subtle">Arabic</dt>
                  <dd className="mt-0.5 font-medium text-fg" dir="rtl">
                    {area.name_arabic}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {hasCoords && (
            <div className="surface-card p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                Coordinates
              </h2>
              <p className="mt-3 font-mono text-sm text-fg">
                {area.latitude!.toFixed(5)}, {area.longitude!.toFixed(5)}
              </p>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3.5 text-sm font-medium text-fg transition-colors hover:border-border-strong"
                >
                  Open in Google Maps
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="surface-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-xl ${accent ? 'text-accent' : 'text-fg'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-muted">{hint}</div>}
    </div>
  );
}
