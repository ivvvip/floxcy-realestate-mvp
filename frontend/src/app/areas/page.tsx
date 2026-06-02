import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AreasCoverageClient } from './AreasCoverageClient';
import { getAllAreas } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Areas Screener — All 362 Dubai Areas',
  description:
    'Every DLD-tracked Dubai area in one screener. Filter by coverage tier, type, and sort by yield, investment score, or volume. Limited-data and no-data areas are shown honestly, never faked.',
};

export const revalidate = 600;

export default async function AreasPage() {
  const coverage = await getAllAreas({ sort_by: 'rent_count' }).catch(() => null);

  if (!coverage) {
    return (
      <div className="bg-bg">
        <Container>
          <div className="mt-6 surface-card border-negative/30 p-5 text-sm text-negative">
            <p className="font-medium">Could not reach the API.</p>
            <Link
              href="/"
              className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            >
              ← Back home
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  const total = coverage.total;
  const full = coverage.counts.full ?? 0;
  const partial = coverage.counts.partial ?? 0;
  const limited = coverage.counts.limited ?? 0;
  const none = coverage.counts.none ?? 0;

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Areas' }]} />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-fg tracking-tight">
                  All Dubai Areas
                </h1>
                <p className="mt-1 text-xs text-fg-muted">
                  <span className="font-mono text-fg">{total}</span> official
                  Dubai areas (DLD canonical registry) · sort, filter, and
                  screen. Limited-data areas shown honestly — never fabricated.
                </p>
              </div>
              <div className="text-left sm:text-right text-[11px] text-fg-subtle">
                <div>
                  <span className="text-fg-muted">Source:</span>{' '}
                  {coverage.data_source}
                </div>
                <div>
                  <span className="text-fg-muted">Updated:</span>{' '}
                  {coverage.last_updated}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* Coverage tier strip */}
      <div className="border-b border-border bg-bg-card/30">
        <Container>
          <div className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
            <span>
              <span className="font-mono text-positive">{full}</span> full data
            </span>
            <span className="text-fg-subtle">·</span>
            <span>
              <span className="font-mono text-accent">{partial}</span> partial
              data
            </span>
            <span className="text-fg-subtle">·</span>
            <span>
              <span className="font-mono text-warning">{limited}</span> limited
              data
            </span>
            <span className="text-fg-subtle">·</span>
            <span>
              <span className="font-mono text-fg-subtle">{none}</span> data
              coming soon
            </span>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4 sm:py-6">
          <AreasCoverageClient initial={coverage.items} />
        </div>
      </Container>
    </div>
  );
}
