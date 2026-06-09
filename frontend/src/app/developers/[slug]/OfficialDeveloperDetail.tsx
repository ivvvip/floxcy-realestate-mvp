import Link from 'next/link';
import { Building2, ShieldCheck, ArrowUpRight, Globe, Phone } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { formatNumber, formatLargeAED } from '@/lib/format';
import { completionStage, statusPill, formatHandover } from '@/lib/offplanOfficial';
import { ClaimProfileButton } from '@/components/ClaimProfileButton';
import type { OfficialDeveloperDetail as Detail, OfficialProjectCard } from '@/lib/types';

export function OfficialDeveloperDetail({ detail }: { detail: Detail }) {
  const { developer: dev, track_record: tr, projects } = detail;
  const active = projects.filter((p) => (p.project_status || '').toUpperCase() === 'ACTIVE');
  const pending = projects.filter((p) => (p.project_status || '').toUpperCase().startsWith('PENDING'));

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Developers', href: '/developers' }, { label: dev.developer_name }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight truncate">{dev.developer_name}</h1>
                  <span className="pill border-positive/40 text-positive bg-positive/5">✅ Official DLD Data</span>
                  <ClaimProfileButton
                    claimType="developer"
                    targetId={dev.developer_number}
                    targetName={dev.developer_name}
                    variant="link"
                  />
                </div>
                <p className="mt-1 flex items-center gap-2 flex-wrap text-xs text-fg-muted">
                  {dev.has_license_record ? (
                    <span className="inline-flex items-center gap-1 text-positive">
                      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                      {dev.legal_status ?? 'Licensed'}{dev.license_type ? ` · ${dev.license_type}` : ''}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">DLD-registered developer · {tr.project_count} projects</span>
                  )}
                  {dev.registration_date && <span>· Registered {formatHandover(dev.registration_date)}</span>}
                </p>
                {(dev.webpage || dev.phone) && (
                  <p className="mt-1 flex items-center gap-3 text-[11px]">
                    {dev.webpage && (
                      <a href={dev.webpage.startsWith('http') ? dev.webpage : `https://${dev.webpage}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                        <Globe className="h-3 w-3" strokeWidth={2.5} /> Website
                      </a>
                    )}
                    {dev.phone && (
                      <span className="inline-flex items-center gap-1 text-fg-muted">
                        <Phone className="h-3 w-3" strokeWidth={2.5} /> {dev.phone}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total projects" value={formatNumber(tr.project_count)} />
            <KpiCard label="Active now" value={formatNumber(tr.active_count)} accent />
            <KpiCard label="Total units" value={formatNumber(tr.total_units)} />
            <KpiCard label="Portfolio value" value={tr.total_value_aed != null ? formatLargeAED(tr.total_value_aed) : '—'} />
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Pending pipeline" value={formatNumber(tr.pending_count)} />
            <KpiCard label="Avg completion" value={tr.avg_percent_completed != null ? `${tr.avg_percent_completed}%` : '—'} />
            <KpiCard label="Areas served" value={formatNumber(tr.areas_served)} />
          </section>

          {tr.top_areas.length > 0 && (
            <section className="surface-card p-4">
              <h2 className="text-sm font-semibold text-fg">Top areas of operation</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {tr.top_areas.map((a) => <span key={a} className="pill">{a}</span>)}
              </div>
            </section>
          )}

          {active.length > 0 && <ProjectsTable title={`Active projects (${active.length})`} rows={active} accent />}
          {pending.length > 0 && <ProjectsTable title={`Pending / coming soon (${pending.length})`} rows={pending} />}

          <p className="text-[11px] text-fg-subtle italic">
            ✅ Official DLD Data — Dubai Land Department projects registry (2026 snapshot).
            {!dev.has_license_record && ' License/contact details are not in the DLD developer registry for this entity; project attribution is the official inline developer name on each project.'}
          </p>
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

function ProjectsTable({ title, rows, accent }: { title: string; rows: OfficialProjectCard[]; accent?: boolean }) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Project</th>
              <th>Area</th>
              <th className="text-right">Completion</th>
              <th className="text-right">Units</th>
              <th className="text-right">Handover</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const stage = completionStage(p.percent_completed);
              const pill = statusPill(p.project_status);
              return (
                <tr key={p.project_number}>
                  <td className="text-fg">
                    {p.project_name ?? `Project ${p.project_number}`}
                    <span className={`ml-2 inline-flex items-center text-[10px] tabular border rounded px-1 py-0.5 ${pill.className}`}>{pill.label}</span>
                  </td>
                  <td className="text-fg-muted">{p.area ?? '—'}</td>
                  <td className="num">
                    <span className={stage.tone}>{(p.percent_completed ?? 0).toFixed(0)}%</span>
                  </td>
                  <td className={`num ${accent ? 'text-accent' : ''}`}>{p.unit_count != null ? formatNumber(p.unit_count) : '—'}</td>
                  <td className="num text-fg-muted">{formatHandover(p.expected_handover) ?? '—'}</td>
                  <td className="text-right">
                    <Link href={`/offplan/${p.project_number}`} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                      View <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
