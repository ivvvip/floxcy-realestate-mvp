import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AreasFilterClient } from './AreasFilterClient';
import { getAreas } from '@/lib/api';
import type { Area } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Areas Screener',
  description:
    'Screen UAE investment areas by yield, price, appreciation, and investment score.',
};

export const revalidate = 60;

export default async function AreasPage() {
  let areas: Area[] = [];
  let error: string | null = null;
  try {
    areas = await getAreas();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load areas.';
  }

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Areas' }]} />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-fg tracking-tight">
                  Areas Screener
                </h1>
                <p className="mt-1 text-xs text-fg-muted">
                  {areas.length > 0
                    ? `${areas.length} UAE investment areas · sort, filter, and screen`
                    : 'Curated investment-grade UAE areas'}
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        {error && (
          <div className="mt-6 surface-card border-negative/30 p-5 text-sm text-negative">
            <p className="font-medium">Could not reach the API.</p>
            <p className="mt-1 text-negative/80">{error}</p>
          </div>
        )}

        {areas.length === 0 && !error ? (
          <div className="mt-6 surface-card flex flex-col items-center justify-center p-10 text-center">
            <p className="text-sm text-fg-muted">No areas available yet.</p>
            <Link
              href="/"
              className="mt-3 text-xs font-medium text-accent hover:underline"
            >
              ← Back home
            </Link>
          </div>
        ) : (
          <div className="py-5">
            <AreasFilterClient areas={areas} />
          </div>
        )}
      </Container>
    </div>
  );
}
