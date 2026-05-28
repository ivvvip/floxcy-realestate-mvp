import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { OpportunitiesClient } from './OpportunitiesClient';
import { Sparkles } from 'lucide-react';
import { getOpportunitiesFeed } from '@/lib/api';
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
  try {
    const res = await getOpportunitiesFeed({ kind: 'all', limit: 60, min_score: 0 });
    opportunities = res.opportunities ?? [];
    total = res.total ?? 0;
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
                  AI-derived market signals across 70 Dubai areas, alongside
                  curated deals from verified investment specialists. Every
                  signal is reproducible — see{' '}
                  <Link href="/methodology" className="text-accent hover:underline">
                    methodology
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          {error ? (
            <div className="border border-negative/30 bg-negative/10 rounded-md px-3 py-2 text-sm text-negative">
              {error}
            </div>
          ) : (
            <OpportunitiesClient opportunities={opportunities} total={total} />
          )}
        </div>
      </Container>
    </div>
  );
}
