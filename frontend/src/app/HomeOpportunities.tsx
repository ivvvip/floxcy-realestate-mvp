import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getOpportunities } from '@/lib/api';
import { OpportunityCard } from '@/components/data/OpportunityCard';

export async function HomeOpportunities() {
  let opportunities: Awaited<ReturnType<typeof getOpportunities>>['opportunities'] = [];
  try {
    const res = await getOpportunities({ limit: 6, min_score: 0 });
    opportunities = res.opportunities ?? [];
  } catch {
    opportunities = [];
  }
  if (!opportunities.length) return null;

  return (
    <section className="border-b border-border bg-bg-card/30">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-7">
        <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" strokeWidth={2} />
              Opportunity Engine · live
            </div>
            <h2 className="mt-1 text-xl font-semibold text-fg">
              Today&rsquo;s top UAE investment opportunities
            </h2>
          </div>
          <Link
            href="/opportunities"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
          >
            See all opportunities
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {opportunities.slice(0, 6).map((o) => (
            <OpportunityCard key={o.area_id} opp={o} />
          ))}
        </div>
      </div>
    </section>
  );
}
