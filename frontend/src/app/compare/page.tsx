import { Suspense } from 'react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { CompareClient } from './CompareClient';
import { getAreas, getCanonicalAreas } from '@/lib/api';
import type { Area } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Compare Areas',
  description: 'Side-by-side comparison of UAE areas across price, yield, and risk.',
};

async function loadAreas(): Promise<Area[]> {
  // Use canonical as the picker universe (284 areas), then fall back to
  // curated for the metadata that compare actually needs (id, type, etc).
  // For DLD-only areas (no curated row), we synthesise a minimal Area
  // object using name_slug as the id — /compare's backend now accepts
  // both UUIDs and slugs, so it round-trips cleanly.
  try {
    const [curated, canon] = await Promise.all([
      getAreas().catch(() => []),
      getCanonicalAreas({ min_occurrences: 5 }).catch(() => null),
    ]);
    if (!canon || canon.items.length === 0) return curated;

    const curatedByUpper = new Map(
      curated.map((a) => [a.name.toUpperCase(), a])
    );
    const merged: Area[] = canon.items.map((c) => {
      const found = curatedByUpper.get(c.area_name_upper);
      if (found) return { ...found, name: c.area_name };
      // Synthetic Area entry for DLD-only canonical areas
      return {
        id: c.area_name_slug,  // compare endpoint accepts name_slug now
        name: c.area_name,
        name_arabic: c.area_name_ar,
        city: 'Dubai',
        emirate: 'Dubai',
        description: null,
        area_type: 'residential',
        latitude: null,
        longitude: null,
        created_at: '',
        updated_at: '',
      };
    });
    return merged;
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
