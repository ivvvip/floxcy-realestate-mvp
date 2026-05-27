import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { OpportunitiesClient } from './OpportunitiesClient';
import { Sparkles } from 'lucide-react';
import { getOpportunities } from '@/lib/api';
import type { OpportunityResult } from '@/lib/types';

export const metadata = {
  title: 'Undervalued Area Detector',
  description:
    'AI-driven detection of UAE real-estate areas trading below where fundamentals suggest they should.',
};

export const revalidate = 300;

export default async function OpportunitiesPage() {
  let opportunities: OpportunityResult[] = [];
  let error: string | null = null;
  try {
    const res = await getOpportunities({ limit: 50 });
    opportunities = res.results;
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
                    Undervalued Area Detector
                  </h1>
                  <span className="pill pill-accent">Killer feature</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  Multi-factor scan: yield premium, price discount, momentum,
                  volume, demand, and risk. Areas scoring 75+ flag as strong
                  opportunities. Every score includes data-confidence and{' '}
                  <Link
                    href="/methodology"
                    className="text-accent hover:underline"
                  >
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
            <OpportunitiesClient opportunities={opportunities} />
          )}
        </div>
      </Container>
    </div>
  );
}
