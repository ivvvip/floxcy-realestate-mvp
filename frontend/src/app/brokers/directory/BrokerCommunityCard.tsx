import { Info, Users } from 'lucide-react';
import type { BrokerNationalityStats } from '@/lib/types';

interface Props {
  stats: BrokerNationalityStats;
}

/**
 * "Broker Community" distribution card. Every count is sourced from
 * `detected_nationality` on dld_rera_brokers, which is heuristically
 * inferred from each broker's name. The disclaimer is rendered
 * inline and emphatically — these are estimates, not DLD-verified.
 */
export function BrokerCommunityCard({ stats }: Props) {
  // We show the labelled breakdown (excludes "Other" which is the catch-all
  // bucket — it's not informative alongside the named groups).
  const named = stats.buckets.filter((b) => b.nationality !== 'Other');
  const otherCount = stats.buckets.find((b) => b.nationality === 'Other')?.count ?? 0;
  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-fg">Broker community</h2>
          <span className="text-[10px] text-fg-subtle tabular">
            {stats.total.toLocaleString()} active RERA brokers
          </span>
        </div>
        <span className="pill text-[10px] inline-flex items-center gap-1 border-warning/30 bg-warning/10 text-warning">
          <Info className="h-2.5 w-2.5" strokeWidth={2.5} />
          Estimated, not verified
        </span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {named.map((b) => (
            <div
              key={b.nationality}
              className="rounded-md border border-border bg-bg-elev/30 p-2.5 text-center"
              title={`${b.count.toLocaleString()} brokers · primary language ${b.language}`}
            >
              <div className="text-xl leading-none">{b.flag}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-fg-subtle truncate">
                {b.nationality}
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular text-fg">
                ~{b.count.toLocaleString()}
              </div>
            </div>
          ))}
          {otherCount > 0 && (
            <div
              className="rounded-md border border-border/60 bg-bg-elev/20 p-2.5 text-center"
              title="Names that don't match any of the curated regional patterns"
            >
              <div className="text-xl leading-none">🌐</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-fg-subtle">
                Unclassified
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular text-fg-muted">
                ~{otherCount.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-warning/5 px-4 py-2 text-[11px] text-fg-muted">
        <span className="font-semibold text-warning">Disclaimer:</span>{' '}
        {stats.estimated_disclaimer}
      </div>
    </section>
  );
}
