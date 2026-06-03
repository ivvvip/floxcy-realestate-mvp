import Link from 'next/link';
import { Building2, ArrowRight, Award } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDevelopers } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { DeveloperCard } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Dubai Real Estate Developers 2026',
  description:
    'Directory of Dubai property developers ranked by project count, units delivered, '
    + 'and Floxcy track-record score — derived from live DLD buildings data.',
};

export default async function DevelopersPage() {
  let items: DeveloperCard[] = [];
  let total = 0;
  let dataSource = '';
  let coverageNote = '';
  let error: string | null = null;
  try {
    const resp = await getDevelopers({ sort: 'score', limit: 60 });
    items = resp.items;
    total = resp.total;
    dataSource = resp.data_source;
    coverageNote = resp.coverage_note;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load developers';
  }

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Developers' }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Dubai Real Estate Developers
                  </h1>
                  <span className="pill pill-accent">{total} brands</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  Every developer on this page is derived from real DLD
                  buildings data — project count, unit volume, areas of
                  operation. Floxcy never sells &quot;verified&quot; badges
                  to the highest bidder.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          {error ? (
            <div className="surface-card p-6 text-center text-fg-muted text-sm">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="surface-card p-6 text-center text-fg-muted text-sm">
              No developer data yet.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => (
                  <DeveloperCardView key={d.slug} dev={d} />
                ))}
              </div>
              <p className="mt-6 text-[11px] text-fg-subtle italic max-w-3xl">
                {coverageNote} <span className="text-fg-muted">{dataSource}</span>
              </p>
            </>
          )}
        </div>
      </Container>
    </div>
  );
}

function DeveloperCardView({ dev }: { dev: DeveloperCard }) {
  return (
    <Link
      href={`/developers/${dev.slug}`}
      className="surface-card p-4 hover:border-accent/40 transition-colors block group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg group-hover:text-accent truncate">
            {dev.name}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-subtle tabular">
            {dev.earliest_year ? `Active since ${dev.earliest_year}` : 'Active in Dubai'}
          </div>
        </div>
        <ScoreBadge score={dev.track_record_score} label={dev.track_record_label} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Projects" value={formatNumber(dev.total_projects)} />
        <Stat label="Off-plan" value={formatNumber(dev.offplan_projects)} accent />
        <Stat label="Units" value={formatNumber(dev.total_units)} />
        <Stat label="Areas" value={formatNumber(dev.areas_served)} />
      </div>

      {dev.top_areas.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="text-[10px] text-fg-subtle uppercase tracking-wide">Top areas</div>
          <div className="mt-1 text-[11px] text-fg-muted truncate">
            {dev.top_areas.join(' · ')}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 text-[11px] text-accent">
        View projects <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
      </div>
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span className={`tabular font-medium ${accent ? 'text-accent' : 'text-fg'}`}>{value}</span>
    </div>
  );
}

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const tone =
    score >= 75
      ? 'text-positive border-positive/30'
      : score >= 60
      ? 'text-accent border-accent/30'
      : 'text-fg-muted border-border';
  return (
    <div
      className={`shrink-0 inline-flex flex-col items-end px-2 py-1 rounded-md border ${tone} tabular`}
      title={`Track-record score: ${score}/100 (${label})`}
    >
      <div className="flex items-center gap-1 text-[11px] font-semibold">
        <Award className="h-3 w-3" strokeWidth={2.5} />
        {score.toFixed(0)}
      </div>
      <div className="text-[9px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
