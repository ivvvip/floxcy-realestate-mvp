import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HardHat, TrendingUp } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { RegisterInterestForm } from './RegisterInterestForm';
import { getOffplanProject } from '@/lib/api';
import { formatNumber } from '@/lib/format';

export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  try {
    const p = await getOffplanProject(params.slug);
    return {
      title: `Buy ${p.master_project} Dubai off-plan`,
      description: `${p.master_project} in ${p.area_name ?? 'Dubai'} by ${p.developer_name} — ${formatNumber(p.total_units)} units across ${p.buildings_count} buildings.`,
    };
  } catch {
    return { title: 'Off-plan project · Floxcy' };
  }
}

export default async function OffplanDetailPage({ params }: Props) {
  let detail;
  try {
    detail = await getOffplanProject(params.slug);
  } catch {
    return notFound();
  }

  const pc = detail.price_context;
  const hasPriceContext = pc.avg_ppsf_offplan != null || pc.avg_ppsf_ready != null;

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[
                { label: 'Off-Plan', href: '/offplan' },
                { label: detail.master_project },
              ]}
            />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <HardHat className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight truncate">
                    {detail.master_project}
                  </h1>
                  <span
                    className={`pill ${
                      detail.status_key === 'completed'
                        ? 'border-positive/40 text-positive bg-positive/5'
                        : detail.status_key === 'coming_soon'
                        ? 'border-accent/40 text-accent bg-accent/5'
                        : 'pill-accent'
                    }`}
                  >
                    {detail.status_key === 'completed' && '✅ Completed'}
                    {detail.status_key === 'coming_soon' && '📋 Coming Soon'}
                    {detail.status_key === 'active' && '🏗️ Under construction'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  {detail.area_name ?? '—'} ·{' '}
                  <Link
                    href={`/developers/${detail.developer_slug}`}
                    className="text-accent hover:underline"
                  >
                    {detail.developer_name}
                  </Link>
                  {' · '}
                  <span className="text-fg-subtle">{detail.status_label}</span>
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Buildings" value={formatNumber(detail.buildings_count)} />
              <KpiCard label="Total units" value={formatNumber(detail.total_units)} accent />
              <KpiCard label="Off-plan" value={formatNumber(detail.offplan_buildings)} />
              <KpiCard label="Ready" value={formatNumber(detail.ready_buildings)} />
            </section>

            {/* Completed-project highlight: "bought off-plan at X, now Y, +Z%" */}
            {detail.status_key === 'completed' && detail.price_gain_pct != null && (
              <section className="rounded-lg border border-positive/40 bg-positive/5 p-4">
                <div className="text-sm font-semibold text-positive">
                  ✅ This project has completed — now trades as ready
                </div>
                <div className="mt-2 text-xs text-fg tabular space-y-1">
                  {detail.offplan_ppsf != null && (
                    <div>
                      Bought off-plan at{' '}
                      <span className="font-semibold text-fg">
                        {formatNumber(detail.offplan_ppsf, 0)} AED/sqft
                      </span>
                      {detail.latest_offplan_year && ` (through ${detail.latest_offplan_year})`}
                    </div>
                  )}
                  {detail.ready_ppsf != null && (
                    <div>
                      Current ready market:{' '}
                      <span className="font-semibold text-fg">
                        {formatNumber(detail.ready_ppsf, 0)} AED/sqft
                      </span>
                      {detail.latest_ready_year && ` (through ${detail.latest_ready_year})`}
                    </div>
                  )}
                  <div className="pt-1">
                    Gain for early buyers:{' '}
                    <span className="font-semibold text-positive">
                      {detail.price_gain_pct >= 0 ? '+' : ''}
                      {detail.price_gain_pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {detail.area_slug && (
                  <Link
                    href={`/areas/${detail.area_slug}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Buy as ready property → see {detail.area_name ?? 'area'} page
                  </Link>
                )}
              </section>
            )}

            {detail.status_key === 'coming_soon' && (
              <section className="rounded-lg border border-accent/40 bg-accent/5 p-4 text-xs text-fg">
                📋 <span className="font-semibold">Coming Soon.</span>{' '}
                Registered on the DLD buildings dataset but no sales on
                record yet — register interest below to be notified.
              </section>
            )}

            <section className="surface-card overflow-hidden">
              <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                <h2 className="text-sm font-semibold text-fg">Off-plan vs ready market</h2>
              </div>
              <div className="p-4 text-xs">
                {hasPriceContext ? (
                  <div className="space-y-2">
                    <Row
                      label="Off-plan avg (area)"
                      value={
                        pc.avg_ppsf_offplan != null
                          ? `${formatNumber(pc.avg_ppsf_offplan, 0)} AED/sqft`
                          : '—'
                      }
                    />
                    <Row
                      label="Ready avg (area)"
                      value={
                        pc.avg_ppsf_ready != null
                          ? `${formatNumber(pc.avg_ppsf_ready, 0)} AED/sqft`
                          : '—'
                      }
                    />
                    {pc.delta_pct != null && (
                      <Row
                        label="Potential gain at completion"
                        value={`${pc.delta_pct >= 0 ? '+' : ''}${pc.delta_pct.toFixed(1)}%`}
                        tone={pc.delta_pct >= 0 ? 'positive' : 'negative'}
                      />
                    )}
                    <p className="mt-2 text-[11px] text-fg-subtle italic">
                      Area-level proxy from DLD transactions. Project-specific
                      ask prices vary — verify with the developer before
                      committing.
                    </p>
                  </div>
                ) : (
                  <p className="text-fg-muted italic">
                    Insufficient comparable sales in this area to compute a
                    reliable off-plan vs ready delta.
                  </p>
                )}
              </div>
            </section>

            {detail.sub_projects.length > 0 && (
              <section className="surface-card overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-fg">
                    Sub-projects ({detail.sub_projects.length})
                  </h2>
                </div>
                <ul className="p-4 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                  {detail.sub_projects.map((sp) => (
                    <li key={sp} className="text-fg-muted">· {sp}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="surface-card p-4">
              <h2 className="text-sm font-semibold text-fg mb-2">Project signals</h2>
              <div className="grid gap-2 text-xs">
                <Signal
                  label="Developer track record"
                  ok
                  hint={`See ${detail.developer_name} profile for full score`}
                />
                <Signal
                  label="Listed in DLD buildings registry"
                  ok
                  hint="Project number is on the Dubai Land Department open dataset"
                />
                <Signal
                  label="Escrow account verification"
                  pending
                  hint="Floxcy does not currently ingest the escrow registry — confirm with developer"
                />
                <Signal
                  label="RERA approval status"
                  pending
                  hint="Not yet integrated into Floxcy. Ask the developer for the RERA registration certificate"
                />
              </div>
            </section>

            <p className="text-[11px] text-fg-subtle italic">{detail.data_source}</p>
          </div>

          <aside>
            <RegisterInterestForm
              projectSlug={detail.slug}
              projectName={detail.master_project}
            />
          </aside>
        </div>
      </Container>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`mt-1 text-lg tabular font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  const c = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg';
  return (
    <div className="flex justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className={`tabular font-medium ${c}`}>{value}</span>
    </div>
  );
}

function Signal({
  label,
  hint,
  ok,
  pending,
}: {
  label: string;
  hint: string;
  ok?: boolean;
  pending?: boolean;
}) {
  const icon = ok ? '✅' : pending ? '🟡' : '⚪';
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 w-5 text-center">{icon}</span>
      <div className="min-w-0">
        <div className="text-fg">{label}</div>
        <div className="text-[11px] text-fg-subtle">{hint}</div>
      </div>
    </div>
  );
}
