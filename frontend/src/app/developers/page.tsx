import Link from 'next/link';
import { Building2, ArrowRight, BadgeCheck, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getOfficialDevelopers } from '@/lib/api';
import { formatNumber, formatLargeAED } from '@/lib/format';
import type { OfficialDeveloperCard } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Dubai Real Estate Developers 2026 — Official DLD Registry',
  description:
    'Directory of Dubai off-plan developers from the official DLD projects registry — '
    + 'project count, declared value, active vs pending pipeline, and RERA license status.',
};

export default async function DevelopersPage() {
  let items: OfficialDeveloperCard[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const resp = await getOfficialDevelopers({ sort: 'projects', limit: 200 });
    items = resp.items;
    total = resp.total;
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Dubai Real Estate Developers
                  </h1>
                  <span className="pill pill-accent">{total} developers</span>
                  <span className="pill border-positive/40 text-positive bg-positive/5">✅ Official DLD Data</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  Every developer here is named on the official DLD off-plan projects
                  registry — real project count, declared portfolio value, and active vs
                  pending pipeline. License status shown where the DLD developer registry
                  matches. Floxcy never sells &quot;verified&quot; badges.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          {error ? (
            <div className="surface-card p-6 text-center text-fg-muted text-sm">{error}</div>
          ) : items.length === 0 ? (
            <div className="surface-card p-6 text-center text-fg-muted text-sm">No developer data yet.</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => <DeveloperCardView key={d.developer_number} dev={d} />)}
              </div>
              <p className="mt-6 text-[11px] text-fg-subtle italic max-w-3xl">
                ✅ Official DLD Data — aggregated from the Dubai Land Department projects
                registry (2026 snapshot). Developer attribution is the official inline
                name on each project; license/legal status is shown where the DLD developer
                registry covers it.
              </p>
            </>
          )}
        </div>
      </Container>
    </div>
  );
}

function DeveloperCardView({ dev }: { dev: OfficialDeveloperCard }) {
  return (
    <Link
      href={`/developers/${dev.developer_number}`}
      className="surface-card p-4 hover:border-accent/40 transition-colors block group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg group-hover:text-accent truncate">
            {dev.developer_name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px]">
            {dev.has_license_record ? (
              <span className="inline-flex items-center gap-1 text-positive">
                <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />
                {dev.legal_status ?? 'Licensed'}
              </span>
            ) : (
              <span className="text-fg-subtle">DLD-registered developer</span>
            )}
          </div>
        </div>
        <div className="shrink-0 inline-flex flex-col items-end px-2 py-1 rounded-md border border-accent/30 text-accent tabular">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
            {dev.project_count}
          </div>
          <div className="text-[9px] uppercase tracking-wider mt-0.5">projects</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Active" value={formatNumber(dev.active_count)} accent />
        <Stat label="Pending" value={formatNumber(dev.pending_count)} />
        <Stat label="Units" value={formatNumber(dev.total_units)} />
        <Stat label="Value" value={dev.total_value_aed != null ? formatLargeAED(dev.total_value_aed) : '—'} />
      </div>

      {dev.top_areas.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="text-[10px] text-fg-subtle uppercase tracking-wide">Top areas</div>
          <div className="mt-1 text-[11px] text-fg-muted truncate">{dev.top_areas.join(' · ')}</div>
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
