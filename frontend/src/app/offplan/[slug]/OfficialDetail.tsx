import Link from 'next/link';
import { HardHat, TrendingUp, ShieldCheck, BadgeCheck, MapPin, Info } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { RegisterInterestForm } from './RegisterInterestForm';
import { formatNumber, formatLargeAED } from '@/lib/format';
import { completionStage, statusPill, formatHandover } from '@/lib/offplanOfficial';
import type { OfficialProjectDetail } from '@/lib/types';

export function OfficialDetail({ detail }: { detail: OfficialProjectDetail }) {
  const o = detail.official;
  const stage = completionStage(o.percent_completed);
  const pill = statusPill(o.project_status);
  const pct = o.percent_completed ?? 0;
  const handover = formatHandover(o.expected_handover);
  const pc = detail.price_context;
  const name = o.project_name ?? `Project ${o.project_number}`;

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Off-Plan', href: '/offplan' }, { label: name }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <HardHat className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight truncate">{name}</h1>
                  <span className={`pill ${pill.className}`}>{pill.label}</span>
                  <span className="pill border-positive/40 text-positive bg-positive/5">✅ Official DLD Data</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted flex items-center gap-1 flex-wrap">
                  <span>{o.area ?? '—'}</span>
                  <span>·</span>
                  {o.developer_number ? (
                    <Link href={`/developers/${o.developer_number}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                      <BadgeCheck className="h-3 w-3 text-positive" strokeWidth={2.5} />
                      {o.developer_name}
                    </Link>
                  ) : (
                    <span>{o.developer_name ?? '—'}</span>
                  )}
                  <span>·</span>
                  <span className={stage.tone}>{stage.emoji} {stage.label}</span>
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {/* KPI strip */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Completion" value={`${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`} accent />
              <KpiCard label="Units" value={o.unit_count != null ? formatNumber(o.unit_count) : '—'} />
              <KpiCard label="Expected handover" value={handover ?? '—'} />
              <KpiCard label="Project value" value={o.project_value_aed != null ? formatLargeAED(o.project_value_aed) : '—'} />
            </section>

            {/* Completion progress */}
            <section className="surface-card p-4">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${stage.tone}`}>{stage.emoji} {stage.label}</span>
                <span className="tabular text-fg-muted">{pct.toFixed(pct % 1 === 0 ? 0 : 1)}% complete</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-bg-elev overflow-hidden">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {o.has_escrow ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-positive border border-positive/30 bg-positive/5 rounded px-2 py-0.5">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> Escrow Protected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted border border-border rounded px-2 py-0.5">
                    No escrow account on record
                  </span>
                )}
                {o.google_maps_url && (
                  <a
                    href={o.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-accent border border-accent/30 bg-accent/5 rounded px-2 py-0.5 hover:bg-accent/10"
                  >
                    <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} /> View on Google Maps
                  </a>
                )}
              </div>
            </section>

            {/* Off-plan vs ready market (transaction-derived, layered on) */}
            {pc && (pc.avg_ppsf_offplan != null || pc.avg_ppsf_ready != null) && (
              <section className="surface-card overflow-hidden">
                <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                  <h2 className="text-sm font-semibold text-fg">Off-plan vs ready market</h2>
                </div>
                <div className="p-4 text-xs space-y-2">
                  <Row label="Off-plan avg (area)" value={pc.avg_ppsf_offplan != null ? `${formatNumber(pc.avg_ppsf_offplan, 0)} AED/sqft` : '—'} />
                  <Row label="Ready avg (area)" value={pc.avg_ppsf_ready != null ? `${formatNumber(pc.avg_ppsf_ready, 0)} AED/sqft` : '—'} />
                  {pc.delta_pct != null && (
                    <Row
                      label="Potential gain at completion"
                      value={`${pc.delta_pct >= 0 ? '+' : ''}${pc.delta_pct.toFixed(1)}%`}
                      tone={pc.delta_pct >= 0 ? 'positive' : 'negative'}
                    />
                  )}
                  <p className="mt-2 text-[11px] text-fg-subtle italic">
                    Area-level proxy from DLD transactions ({formatNumber(pc.sample_offplan_sales)} off-plan ·{' '}
                    {formatNumber(pc.sample_ready_sales)} ready building-samples). Project ask prices vary — confirm with the developer.
                  </p>
                </div>
              </section>
            )}

            {/* Official registry fields */}
            <section className="surface-card overflow-hidden">
              <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5 text-positive" strokeWidth={2.5} />
                <h2 className="text-sm font-semibold text-fg">Official DLD registry</h2>
              </div>
              <div className="p-4 grid gap-2 text-xs sm:grid-cols-2">
                <Row label="Project number" value={o.project_number} />
                <Row label="Status" value={o.project_status ?? '—'} />
                <Row label="Project type" value={o.project_type ?? '—'} />
                <Row label="Zone" value={o.zone ?? '—'} />
                <Row label="Escrow account" value={o.escrow_account_number ?? 'Not on record'} />
                <Row label="Buildings / villas / units" value={`${o.counts.building ?? '—'} / ${o.counts.villa ?? '—'} / ${o.counts.unit ?? '—'}`} />
                <Row label="Start" value={formatHandover(o.timeline.start) ?? '—'} />
                <Row label="Expected completion" value={formatHandover(o.timeline.end) ?? '—'} />
                {o.timeline.inspection && <Row label="Last inspection" value={formatHandover(o.timeline.inspection) ?? '—'} />}
                {o.timeline.handover && <Row label="Actual handover" value={formatHandover(o.timeline.handover) ?? '—'} />}
              </div>
              {o.description && (
                <div className="px-4 pb-4 text-[11px] text-fg-muted">{o.description}</div>
              )}
            </section>

            {/* TIER 2 enrichment — only when present, clearly separated */}
            {detail.enrichment && (
              <section className="surface-card overflow-hidden border-accent/30">
                <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                  <h2 className="text-sm font-semibold text-fg">{detail.enrichment.label}</h2>
                </div>
                <div className="p-4 grid gap-2 text-xs sm:grid-cols-2">
                  {detail.enrichment.payment_plan && <Row label="Payment plan" value={detail.enrichment.payment_plan} />}
                  {detail.enrichment.starting_price_aed != null && <Row label="Starting price" value={formatLargeAED(detail.enrichment.starting_price_aed)} />}
                  {detail.enrichment.bedroom_types && <Row label="Bedroom types" value={detail.enrichment.bedroom_types} />}
                  {detail.enrichment.enrichment_source && <Row label="Source" value={detail.enrichment.enrichment_source} />}
                </div>
              </section>
            )}

            {/* Honest gap note: payment/floor plans aren't in any DLD feed */}
            <section className="rounded-lg border border-border bg-bg-elev/30 p-4 text-xs text-fg-muted">
              <span className="font-semibold text-fg">Payment plans, floor plans & unit layouts</span> are not
              published in the DLD registry. For these, register interest below and a specialist will get them
              directly from the developer.
            </section>

            <p className="text-[11px] text-fg-subtle italic">✅ Official DLD Data — Dubai Land Department projects registry (2026 snapshot).</p>
          </div>

          <aside>
            <RegisterInterestForm projectSlug={o.project_number} projectName={name} />
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
      <div className={`mt-1 text-lg tabular font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  const c = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg';
  return (
    <div className="flex justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className={`tabular font-medium text-right ${c}`}>{value}</span>
    </div>
  );
}
