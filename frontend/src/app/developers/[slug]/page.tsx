import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, Award, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDeveloperDetail } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { DeveloperProjectRow } from '@/lib/types';

export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  try {
    const dev = await getDeveloperDetail(params.slug);
    return {
      title: `${dev.name} Projects Dubai`,
      description: `${dev.summary.total_projects} projects · ${formatNumber(dev.summary.total_units)} units · Active in ${dev.summary.areas_served} Dubai areas. Track-record score ${dev.summary.track_record_score}/100.`,
    };
  } catch {
    return { title: 'Developer · Floxcy' };
  }
}

export default async function DeveloperDetailPage({ params }: Props) {
  let detail;
  try {
    detail = await getDeveloperDetail(params.slug);
  } catch {
    return notFound();
  }

  const { summary, projects, name } = detail;
  const active = projects.filter((p) => p.status_key === 'active');
  const completed = projects.filter((p) => p.status_key === 'completed');
  const comingSoon = projects.filter((p) => p.status_key === 'coming_soon');

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[
                { label: 'Developers', href: '/developers' },
                { label: name },
              ]}
            />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight truncate">
                    {name}
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Active since {summary.earliest_year ?? '—'} ·{' '}
                  {summary.areas_served} Dubai areas
                </p>
              </div>
              <div
                className="inline-flex flex-col items-end px-3 py-1.5 rounded-md border border-positive/30 text-positive tabular"
                title={`Floxcy track-record score: ${summary.track_record_score}/100`}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Award className="h-4 w-4" strokeWidth={2.5} />
                  {summary.track_record_score.toFixed(0)}/100
                </div>
                <div className="text-[10px] uppercase tracking-wider mt-0.5">
                  {summary.track_record_label}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 space-y-5">
          {/* Summary grid */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total projects" value={formatNumber(summary.total_projects)} />
            <KpiCard label="Off-plan now" value={formatNumber(summary.offplan_projects)} accent />
            <KpiCard label="Units delivered" value={formatNumber(summary.total_units)} />
            <KpiCard label="Areas served" value={formatNumber(summary.areas_served)} />
          </section>

          {summary.top_areas.length > 0 && (
            <section className="surface-card p-4">
              <h2 className="text-sm font-semibold text-fg">Top areas of operation</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.top_areas.map((a) => (
                  <span key={a} className="pill">{a}</span>
                ))}
              </div>
            </section>
          )}

          {/* Active off-plan projects — selling now */}
          {active.length > 0 && (
            <ProjectsList
              title={`Active projects · under construction (${active.length})`}
              rows={active}
              accent
            />
          )}

          {/* Completed projects — done, now trading as ready */}
          {completed.length > 0 && (
            <ProjectsList
              title={`Completed projects (${completed.length})`}
              rows={completed}
            />
          )}

          {/* Coming Soon — registered, no sales yet */}
          {comingSoon.length > 0 && (
            <ProjectsList
              title={`Coming Soon (${comingSoon.length})`}
              rows={comingSoon}
            />
          )}

          <p className="text-[11px] text-fg-subtle italic">
            {detail.data_source}
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
      <div className={`mt-1 text-lg tabular font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>
        {value}
      </div>
    </div>
  );
}

function ProjectsList({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: DeveloperProjectRow[];
  accent?: boolean;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Project</th>
              <th>Area</th>
              <th className="text-right">Buildings</th>
              <th className="text-right">Units</th>
              <th className="text-right">Years</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.project_slug}>
                <td className="text-fg">{p.master_project}</td>
                <td className="text-fg-muted">{p.area_name ?? '—'}</td>
                <td className="num">{formatNumber(p.buildings_count)}</td>
                <td className={`num ${accent ? 'text-accent' : ''}`}>
                  {formatNumber(p.total_units)}
                </td>
                <td className="num text-fg-muted">
                  {p.earliest_year && p.latest_year
                    ? p.earliest_year === p.latest_year
                      ? `${p.earliest_year}`
                      : `${p.earliest_year}–${p.latest_year}`
                    : '—'}
                </td>
                <td className="text-right">
                  {p.is_offplan ? (
                    <Link
                      href={`/offplan/${p.project_slug}`}
                      className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                    >
                      View <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                    </Link>
                  ) : (
                    <span className="text-[11px] text-fg-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
