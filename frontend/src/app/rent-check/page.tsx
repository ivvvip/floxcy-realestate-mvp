import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDldStats, getDldAreas } from '@/lib/api';
import { RentCheckClient } from './RentCheckClient';

export const metadata: Metadata = {
  title: 'Is Your Rent Fair? — DLD Benchmark',
  description:
    'Check your Dubai rent against Dubai Land Department market benchmarks. Pick your area, choose your size, enter your rent — get a fair/above/below verdict in one tap.',
};

export const revalidate = 3600;

export default async function RentCheckPage() {
  // Prefetch in parallel; both are heavily cached server-side.
  const [stats, areas] = await Promise.all([
    getDldStats().catch(() => null),
    // Only areas with enough rent contracts to support a benchmark
    getDldAreas({ min_rents: 30, limit: 500 }).catch(() => null),
  ]);

  // Sort areas by sample size (most contracts first) so the dropdown
  // suggests the popular areas at the top after a search.
  const areaOptions = (areas?.items ?? [])
    .filter((a) => a.rent_count_2026 >= 30)
    .map((a) => ({
      name: a.name,
      name_norm: a.name_norm,
      rent_count: a.rent_count_2026,
      median_annual_rent: a.median_annual_rent,
    }))
    .sort((a, b) => b.rent_count - a.rent_count);

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Rent Fairness Check' }]} />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Is Your Rent Fair?
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Benchmark against{' '}
                  <span className="font-mono text-fg">
                    {stats?.total_rent_benchmark_cells.toLocaleString() ?? '2,086'}
                  </span>{' '}
                  Dubai Land Department rent cells. Three taps, real numbers, no signup.
                </p>
              </div>
              {stats && (
                <div className="text-left sm:text-right text-[11px] text-fg-subtle">
                  <div>
                    <span className="text-fg-muted">Source:</span>{' '}
                    {stats.data_source}
                  </div>
                  <div>
                    <span className="text-fg-muted">Updated:</span>{' '}
                    {stats.last_updated}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4 sm:py-6">
          <RentCheckClient areaOptions={areaOptions} />
        </div>
      </Container>
    </div>
  );
}
