import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  BadgeCheck,
  CalendarClock,
  Home,
  Layers,
  Phone,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import {
  ApiError,
  getDldBuilding,
  getDldBuildingComparable,
} from '@/lib/api';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { BuildingConsultationButton } from './BuildingConsultationButton';

export const revalidate = 600;

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const res = await getDldBuilding(params.id);
    const b = res.building;
    return {
      title: `${b.project_name ?? 'Building'} — X-Ray`,
      description: `Per-building rent intelligence for ${b.project_name ?? 'this building'} (${b.area_name ?? 'Dubai'}). Total annual income, occupancy proxy, implied yield. Source: DLD Ejari.`,
    };
  } catch {
    return { title: 'Building X-Ray' };
  }
}

export default async function BuildingDetailPage({ params }: PageProps) {
  let detailRes;
  let comparable = null;
  try {
    detailRes = await getDldBuilding(params.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  try {
    comparable = await getDldBuildingComparable(params.id, 5);
  } catch {
    // soft-fail — comparable is non-critical
  }

  const b = detailRes.building;
  const ctx = b.area_context;

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[
                { label: 'Building X-Ray', href: '/buildings' },
                { label: b.project_name ?? 'Building' },
              ]}
            />
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight truncate">
                    {b.project_name ?? 'Unnamed building'}
                  </h1>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-muted">
                  {b.area_name && (
                    <span>
                      📍{' '}
                      {ctx ? (
                        <Link
                          href={`/buildings?area=${encodeURIComponent(ctx.name_norm)}`}
                          className="text-accent hover:underline"
                        >
                          {b.area_name}
                        </Link>
                      ) : (
                        b.area_name
                      )}
                    </span>
                  )}
                  {ctx?.community_name && (
                    <span className="text-fg">
                      ·{' '}
                      <Link
                        href={`/buildings?area=${encodeURIComponent(ctx.community_name.toLowerCase())}`}
                        className="text-accent hover:underline"
                        title={`part of ${ctx.community_name}`}
                      >
                        part of {ctx.community_name}
                      </Link>
                    </span>
                  )}
                  {b.master_project && <span>· {b.master_project}</span>}
                  {b.prop_sub_type && <span>· {b.prop_sub_type}</span>}
                  {b.is_freehold === true && (
                    <span className="inline-flex items-center gap-1 rounded bg-positive/15 px-1.5 py-0.5 text-positive">
                      <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />
                      Freehold
                    </span>
                  )}
                  {b.is_offplan === true && (
                    <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-warning">
                      <CalendarClock className="h-3 w-3" strokeWidth={2.5} />
                      Off-plan
                    </span>
                  )}
                </div>
              </div>
              <div className="text-left sm:text-right text-[11px] text-fg-subtle whitespace-nowrap">
                <div>
                  <span className="text-fg-muted">Source:</span> DLD Ejari Data
                </div>
                <div>
                  <span className="text-fg-muted">Updated:</span>{' '}
                  {detailRes.last_updated}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4 sm:py-6 space-y-5">
          {/* Building intelligence — type / age / vs-area / demand / community */}
          <BuildingIntelligence b={b} />

          {/* 4-tile income strip */}
          <section className="card overflow-hidden">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
              <Tile
                label="Total annual income"
                value={
                  b.total_annual_income != null
                    ? formatAED(b.total_annual_income)
                    : '—'
                }
                sub={`${b.active_rent_count.toLocaleString()} active contracts`}
                tone="accent"
              />
              <Tile
                label="Occupancy"
                value={
                  b.occupancy_proxy_pct != null
                    ? `${b.occupancy_proxy_pct.toFixed(0)}%`
                    : '—'
                }
                sub="Renewal proxy"
              />
              <Tile
                label="Implied yield"
                value={
                  b.implied_yield_pct != null
                    ? formatPercent(b.implied_yield_pct, 2)
                    : '—'
                }
                sub={
                  b.implied_yield_pct != null
                    ? 'Rent/sqft ÷ area median PPSF'
                    : 'Need DLD price data for this area'
                }
                tone={b.implied_yield_pct != null ? 'positive' : 'default'}
              />
              <Tile
                label="YoY rent trend"
                value={
                  ctx?.rent_growth_yoy_pct != null
                    ? `${ctx.rent_growth_yoy_pct >= 0 ? '+' : ''}${ctx.rent_growth_yoy_pct.toFixed(1)}%`
                    : '—'
                }
                sub={ctx?.rent_growth_yoy_pct != null ? `vs 2025 · ${ctx.name}` : 'Area-level'}
                tone={
                  ctx?.rent_growth_yoy_pct == null
                    ? 'default'
                    : ctx.rent_growth_yoy_pct >= 0
                      ? 'positive'
                      : 'negative'
                }
                icon={
                  ctx?.rent_growth_yoy_pct == null ? null : ctx.rent_growth_yoy_pct >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-positive" strokeWidth={2.5} />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-negative" strokeWidth={2.5} />
                  )
                }
              />
            </div>
          </section>

          {/* Per-contract / sqft economics */}
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
              <Home className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              Per-contract economics
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MiniTile
                label="Avg annual rent"
                value={b.avg_annual_rent != null ? formatAED(b.avg_annual_rent) : '—'}
                hint="Per active contract"
              />
              <MiniTile
                label="Avg rent / sqft"
                value={
                  b.avg_rent_per_sqft != null
                    ? `AED ${formatNumber(b.avg_rent_per_sqft, 0)}`
                    : '—'
                }
                hint="Per active contract"
              />
              <MiniTile
                label="Est. unit price"
                value={
                  b.estimated_unit_price != null
                    ? formatAED(b.estimated_unit_price)
                    : '—'
                }
                hint={
                  b.estimated_unit_size_sqft != null
                    ? `${b.estimated_unit_size_sqft.toFixed(0)} sqft × area median PPSF`
                    : 'Needs area DLD price data'
                }
              />
            </div>
          </section>

          {/* Building physicals + area context */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Layers className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                Building footprint
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                <Row label="Flats" value={b.flats?.toString() ?? '—'} />
                <Row label="Floors" value={b.floors?.toString() ?? '—'} />
                <Row label="Building levels" value={b.bld_levels?.toString() ?? '—'} />
                <Row label="Elevators" value={b.elevators?.toString() ?? '—'} />
                <Row label="Swimming pools" value={b.swimming_pools?.toString() ?? '—'} />
                <Row label="Car parks" value={b.car_parks?.toString() ?? '—'} />
              </dl>
            </div>

            {ctx && (
              <div className="card p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
                  Area context — {ctx.name}
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                  <Row
                    label="Median rent (area)"
                    value={
                      ctx.median_annual_rent != null
                        ? formatAED(ctx.median_annual_rent)
                        : '—'
                    }
                  />
                  <Row
                    label="Median rent / sqft"
                    value={
                      ctx.median_rent_per_sqft != null
                        ? `AED ${formatNumber(ctx.median_rent_per_sqft, 0)}`
                        : '—'
                    }
                  />
                  <Row
                    label="Median price / sqft"
                    value={
                      ctx.median_price_per_sqft != null
                        ? `AED ${formatNumber(ctx.median_price_per_sqft, 0)}`
                        : '—'
                    }
                  />
                  <Row
                    label="Area yield (capped)"
                    value={
                      ctx.rental_yield_pct != null
                        ? `${ctx.rental_yield_pct.toFixed(2)}%`
                        : 'n/a'
                    }
                  />
                  <Row
                    label="Sample (sales)"
                    value={ctx.sales_count.toLocaleString()}
                  />
                  <Row
                    label="Sample (rents)"
                    value={ctx.rent_count_2026.toLocaleString()}
                  />
                </dl>
              </div>
            )}
          </section>

          {/* Comparable buildings */}
          {comparable && comparable.items.length > 0 && (
            <section className="card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  Comparable buildings ({b.prop_sub_type ?? '—'} in {b.area_name ?? 'this area'})
                </h2>
                <Link
                  href={`/buildings?area=${encodeURIComponent(ctx?.name_norm ?? '')}`}
                  className="text-[11px] text-accent hover:underline"
                >
                  See all →
                </Link>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {comparable.items.map((c) => (
                  <Link
                    key={c.id}
                    href={`/buildings/${c.id}`}
                    className="rounded border border-border bg-bg-elev p-3 hover:border-accent/40"
                  >
                    <div className="text-sm font-medium text-fg truncate">
                      {c.project_name ?? '—'}
                    </div>
                    <div className="mt-1 text-[11px] text-fg-subtle">
                      {c.active_rent_count.toLocaleString()} active rents
                      {c.occupancy_proxy_pct != null &&
                        ` · occ ${c.occupancy_proxy_pct.toFixed(0)}%`}
                    </div>
                    <div className="mt-2 text-[11px] text-fg-muted">
                      Income range:{' '}
                      <span className="text-fg">{c.income_range_label ?? '—'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* CTA */}
          <section className="card p-4 sm:p-5 border-2 border-accent/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                  <Phone className="h-4 w-4 text-accent" strokeWidth={2} />
                  Want to invest in {b.project_name ?? 'this building'}?
                </h2>
                <p className="mt-1 text-xs text-fg-muted">
                  We&apos;ll match you with a RERA-licensed broker who specialises
                  in {b.area_name ?? 'this area'}.
                </p>
              </div>
              <BuildingConsultationButton
                buildingProject={b.project_name ?? 'this building'}
                areaName={b.area_name ?? null}
              />
            </div>
          </section>

          <p className="text-[10px] text-fg-subtle">
            {detailRes.data_source} · last updated {detailRes.last_updated}.
            Income is a proxy (avg contract × active count); implied yield is
            capped at 25% to filter small-sample artefacts and is null when the
            area has insufficient DLD price data.
          </p>
        </div>
      </Container>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Tile({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'accent';
}) {
  return (
    <div className="bg-bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-lg sm:text-xl leading-tight tabular flex items-center gap-1.5',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'accent' && 'text-accent'
        )}
      >
        {icon}
        <span className="font-mono">{value}</span>
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-fg-subtle">{sub}</div>}
    </div>
  );
}

function MiniTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-border bg-bg-elev p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className="mt-1 text-sm font-mono text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-fg-subtle">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg font-mono text-right">{value}</dd>
    </>
  );
}

// ---------------------------------------------------------------------------
// Building intelligence panel — type explanation, age, vs-area benchmark,
// demand signal, community siblings. Server-rendered from the building
// detail response (no extra fetches).
// ---------------------------------------------------------------------------

const TYPE_EXPLAINER: Record<string, string> = {
  tower:
    'A specific tower/development — the project name maps to a single building or a small named cluster.',
  complex:
    'Project name matches the master community name — this row is a community-wide aggregate of multiple buildings, not a single tower.',
  villa_community:
    'A villa community — units are typically standalone houses or townhouses under the same master project.',
  under_construction:
    'Off-plan project — units are still being built. No rental contracts yet; the row exists for tracking purposes only.',
};

const DEMAND_EXPLAINER: Record<string, { tone: string; label: string }> = {
  very_high: { tone: 'text-positive', label: '🔥 Very high demand' },
  high:      { tone: 'text-accent',   label: '📈 High demand' },
  moderate:  { tone: 'text-fg-muted', label: '→ Moderate demand' },
  low:       { tone: 'text-fg-subtle', label: '— Low / new building' },
};

function BuildingIntelligence({
  b,
}: {
  b: import('@/lib/types').DldBuildingDetail;
}) {
  const hasAny =
    b.building_type ||
    b.age_years != null ||
    b.rent_psf_vs_area_pct != null ||
    b.demand_signal ||
    (b.is_community_aggregate && b.master_project);
  if (!hasAny) return null;

  const typeExplain = b.building_type ? TYPE_EXPLAINER[b.building_type] : null;
  const dem = b.demand_signal ? DEMAND_EXPLAINER[b.demand_signal] : null;
  const deltaPct = b.rent_psf_vs_area_pct;
  const builtYear =
    b.age_years != null && b.age_years > 0 ? 2026 - b.age_years : null;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Floxcy intelligence</h2>
        <span className="text-[10px] text-fg-subtle tabular">
          derived from DLD building registry
        </span>
      </div>
      <div className="p-4 grid gap-4 md:grid-cols-12">
        {/* Type + explainer */}
        <div className="md:col-span-5 rounded-md border border-border bg-bg-elev/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
            Building type
          </div>
          <div className="mt-1 text-base font-semibold text-fg inline-flex items-center gap-1.5">
            <span>{b.building_type_emoji ?? '—'}</span>
            <span>{b.building_type_label ?? 'Unknown'}</span>
          </div>
          {typeExplain && (
            <p className="mt-1.5 text-[11px] text-fg-muted leading-snug">
              {typeExplain}
            </p>
          )}
          {b.is_community_aggregate && b.master_project && (
            <div className="mt-2 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] text-accent">
              🏘️ Part of <span className="text-fg">{b.master_project}</span>
              {b.siblings_in_master_project && b.siblings_in_master_project > 1 && (
                <>
                  {' '}· {b.siblings_in_master_project} aggregated buildings in this community
                </>
              )}
            </div>
          )}
        </div>

        {/* Age + condition */}
        <div className="md:col-span-3 rounded-md border border-border bg-bg-elev/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
            Building age
          </div>
          {b.age_years != null && builtYear ? (
            <>
              <div className="mt-1 text-base font-semibold text-fg tabular">
                {b.age_years}<span className="text-sm text-fg-muted ml-1">years</span>
              </div>
              <p className="mt-1 text-[10px] text-fg-muted">
                Built ~{builtYear} ·{' '}
                <span className={b.age_years < 5 ? 'text-positive' : b.age_years > 15 ? 'text-warning' : 'text-fg-muted'}>
                  {b.age_years < 5 ? 'New construction' :
                   b.age_years < 15 ? 'Modern' : 'Established'}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-fg-subtle italic">
              No creation date in DLD registry for this building.
            </p>
          )}
        </div>

        {/* vs-area benchmark */}
        <div className="md:col-span-4 rounded-md border border-border bg-bg-elev/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
            vs Area rent/sqft
          </div>
          {deltaPct != null ? (
            <>
              <div
                className={`mt-1 text-base font-semibold tabular ${
                  deltaPct < -5
                    ? 'text-positive'
                    : deltaPct > 5
                      ? 'text-warning'
                      : 'text-fg'
                }`}
              >
                {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
              </div>
              <p className="mt-1 text-[10px] text-fg-muted">
                Your {b.avg_rent_per_sqft?.toFixed(0) ?? '—'} AED/sqft vs area median{' '}
                {b.area_median_rent_psf?.toFixed(0) ?? '—'} AED/sqft.{' '}
                {deltaPct < -5
                  ? 'Below market — potential value pick or lower spec.'
                  : deltaPct > 5
                    ? 'Above market — premium positioning.'
                    : 'In line with the area median.'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-fg-subtle italic">
              Need at least 3 buildings with rent data in this area to benchmark.
            </p>
          )}
        </div>

        {/* Demand signal */}
        <div className="md:col-span-12 rounded-md border border-border bg-bg p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
              Rental demand signal
            </div>
            {dem && (
              <span className={`text-xs font-medium ${dem.tone}`}>{dem.label}</span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-fg-muted">
            <span className="tabular text-fg font-medium">
              {b.active_rent_count.toLocaleString()}
            </span>{' '}
            active rent contracts in DLD Ejari.{' '}
            {b.demand_signal === 'very_high'
              ? 'Top-tier — building is highly liquid for rental purposes.'
              : b.demand_signal === 'high'
                ? 'Strong activity — easy to find tenants.'
                : b.demand_signal === 'moderate'
                  ? 'Healthy but not top-tier — expect normal vacancy periods.'
                  : 'Low activity — could indicate new building, less popular area, or larger units that turn over slowly.'}
          </p>
        </div>
      </div>
    </section>
  );
}

// CTA arrow re-export keeps the icon tree-shaken into the bundle
void ArrowRight;
