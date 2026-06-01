import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDldStats } from '@/lib/api';
import { RentCheckClient } from './RentCheckClient';

export const metadata: Metadata = {
  title: 'Is Your Rent Fair? — DLD Benchmark',
  description:
    'Check your Dubai rent against Dubai Land Department market benchmarks. See where you sit in the percentile distribution and find cheaper similar areas.',
};

export default async function RentCheckPage() {
  const stats = await getDldStats().catch(() => null);
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Rent Fairness Check' }]} />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Is Your Rent Fair?
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Benchmark your rent against{' '}
                  <span className="font-mono text-fg">
                    {stats?.total_rent_benchmark_cells.toLocaleString() ?? '2,086'}
                  </span>{' '}
                  Dubai Land Department rent cells, by area, property type and size band.
                </p>
              </div>
              {stats && (
                <div className="hidden sm:block text-right text-[11px] text-fg-subtle">
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
        <div className="py-5">
          <RentCheckClient />
        </div>
      </Container>
    </div>
  );
}
