import Link from 'next/link';
import { ArrowRight, Building2, Award } from 'lucide-react';
import { getDevelopers } from '@/lib/api';
import { formatNumber } from '@/lib/format';

export async function HomeFeaturedDevelopers() {
  let items: Awaited<ReturnType<typeof getDevelopers>>['items'] = [];
  try {
    // Sort by units (transaction volume) — the most intuitive "by value"
    // proxy we can compute from DLD open data. The track-record score
    // surfaces in each card so investors can see the full picture.
    const res = await getDevelopers({ sort: 'units', limit: 5 });
    items = res.items;
  } catch {
    items = [];
  }
  if (items.length === 0) return null;

  return (
    <section className="border-b border-border bg-bg-card/20">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-7">
        <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-accent" strokeWidth={2} />
              Featured developers · live
            </div>
            <h2 className="mt-1 text-xl font-semibold text-fg">
              Top developers by Dubai sales volume
            </h2>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              Ranked by transaction volume in the DLD sales registry.
              Every score is derived from real project count, unit
              volume, and area diversity.
            </p>
          </div>
          <Link
            href="/developers"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
          >
            See all developers
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {items.map((d) => (
            <Link
              key={d.slug}
              href={`/developers/${d.slug}`}
              className="surface-card p-3 hover:border-accent/40 transition-colors block group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-fg group-hover:text-accent truncate">
                    {d.name}
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-subtle tabular">
                    {d.earliest_year ? `Since ${d.earliest_year}` : 'Active'}
                  </div>
                </div>
                <span
                  className="shrink-0 inline-flex items-center gap-0.5 text-[10px] tabular text-positive border border-positive/30 rounded px-1 py-0.5"
                  title={`Track-record score: ${d.track_record_score}/100`}
                >
                  <Award className="h-2.5 w-2.5" strokeWidth={2.5} />
                  {d.track_record_score.toFixed(0)}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                <Mini label="Projects" value={formatNumber(d.total_projects)} />
                <Mini label="Off-plan" value={formatNumber(d.offplan_projects)} accent />
                <Mini label="Sales" value={formatNumber(d.total_units)} />
                <Mini label="Areas" value={formatNumber(d.areas_served)} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span className={`tabular font-medium ${accent ? 'text-accent' : 'text-fg'}`}>{value}</span>
    </div>
  );
}
