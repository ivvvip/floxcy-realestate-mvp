import { Suspense } from 'react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { CompareClient } from './CompareClient';
import { getAreas } from '@/lib/api';
import type { Area } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Compare Areas',
  description: 'Side-by-side comparison of UAE areas across price, yield, and risk.',
};

async function loadAreas(): Promise<Area[]> {
  try {
    return await getAreas();
  } catch {
    return [];
  }
}

export default async function ComparePage() {
  const areas = await loadAreas();

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Compare' }]} />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-fg tracking-tight">
                  Compare Areas
                </h1>
                <p className="mt-1 text-xs text-fg-muted">
                  Side-by-side metrics, radar profile, and 12-month price overlay
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <Suspense fallback={<div className="text-xs text-fg-subtle">Loading…</div>}>
            <CompareClient areas={areas} />
          </Suspense>
        </div>
      </Container>
    </div>
  );
}
