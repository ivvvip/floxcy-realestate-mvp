import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { OpportunitiesClient } from './OpportunitiesClient';
import { DldOpportunitiesPanel } from './DldOpportunitiesPanel';
import { Sparkles } from 'lucide-react';
import { getOpportunitiesFeed, getCanonicalAreas } from '@/lib/api';
import type { OpportunityFeedItem } from '@/lib/types';

export const metadata = {
  title: 'Investment Opportunities',
  description:
    'Curated UAE real estate investment opportunities — AI-derived market signals plus broker-submitted deals, all in one feed.',
};

export const revalidate = 300;

export default async function OpportunitiesPage() {
  let opportunities: OpportunityFeedItem[] = [];
  let total = 0;
  let error: string | null = null;
  // Canonical area names — single source of truth for the area picker.
  // Empty list on failure degrades the combobox to a free-text input.
  let areaOptions: { name: string; name_norm: string; occurrence_count: number }[] = [];
  try {
    const [feed, canonical] = await Promise.all([
      getOpportunitiesFeed({ kind: 'all', limit: 60, min_score: 0 }),
      getCanonicalAreas({ min_occurrences: 0 }).catch(() => null),
    ]);
    opportunities = feed.opportunities ?? [];
    total = feed.total ?? 0;
    if (canonical) {
      areaOptions = canonical.items.map((a) => ({
        name: a.area_name,
        name_norm: a.area_name_upper,
        occurrence_count: a.occurrence_count,
      }));
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load opportunities.';
  }

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Opportunities' }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Curated UAE Investment Opportunities
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  AI-derived market signals across 70 curated Dubai areas,
                  alongside deals from verified investment specialists. Every
                  signal is reproducible — see{' '}
                  <Link href="/methodology" className="text-accent hover:underline">
                    methodology
                  </Link>
                  .
                </p>
              </div>
              <Link
                href="/areas"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3.5 text-xs font-medium text-accent hover:bg-accent/20"
              >
                Explore all 362 DLD areas →
              </Link>
            </div>
            <div className="mt-3 rounded border border-border bg-bg-card/50 px-3 py-2 text-[11px] text-fg-subtle">
              <span className="font-medium text-fg">Note on coverage:</span>{' '}
              opportunity scoring runs on the 70 curated areas with full
              MarketSnapshot history. To browse the other 292 DLD-tracked
              areas (which have rent/sales data but no Floxcy scoring yet),{' '}
              <Link href="/areas" className="text-accent hover:underline">
                use the Areas screener
              </Link>
              . We don&apos;t fabricate scores where we lack the history.
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 space-y-6">
          {/* DLD-grounded opportunities — primary section */}
          <DldOpportunitiesPanel />

          {/* Curated feed (broker deals + AI signals) — secondary */}
          <div className="border-t border-border pt-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2.5} />
                Curated deals + AI signals
              </h2>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                Hand-picked deals from verified brokers plus algorithmic signals on
                the 70 curated areas with full MarketSnapshot history.
              </p>
            </div>
            {error ? (
              <div className="border border-negative/30 bg-negative/10 rounded-md px-3 py-2 text-sm text-negative">
                {error}
              </div>
            ) : (
              <OpportunitiesClient
                opportunities={opportunities}
                total={total}
                areaOptions={areaOptions}
              />
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
