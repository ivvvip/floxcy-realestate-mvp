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

// Canonical (DLD admin) name → friendly curated name. The master DLD
// list calls Dubai Marina "Marsa Dubai" — investors don't recognise the
// admin name, so without this alias the curated "Dubai Marina" row gets
// orphaned and the picker shows "Marsa Dubai" instead.
const CANONICAL_TO_FRIENDLY_UPPER: Record<string, string> = {
  'MARSA DUBAI': 'DUBAI MARINA',
};

async function loadAreas(): Promise<Area[]> {
  // Use canonical as the picker universe (284 areas), then fall back to
  // curated for the metadata that compare actually needs (id, type, etc).
  // For DLD-only areas (no curated row), we synthesise a minimal Area
  // object using name_slug as the id — /compare's backend accepts both
  // UUIDs and slugs, so it round-trips cleanly.
  try {
    const [curated, canon] = await Promise.all([
      getAreas().catch(() => []),
      getCanonicalAreas({ min_occurrences: 0 }).catch(() => null),
    ]);
    if (!canon || canon.items.length === 0) return curated;

    const curatedByUpper = new Map(
      curated.map((a) => [a.name.toUpperCase(), a])
    );
    const usedCuratedIds = new Set<string>();
    const merged: Area[] = canon.items.map((c) => {
      const aliasUpper =
        CANONICAL_TO_FRIENDLY_UPPER[c.area_name_upper] ?? c.area_name_upper;
      const found = curatedByUpper.get(aliasUpper);
      if (found) {
        usedCuratedIds.add(found.id);
        // Keep curated friendly name + UUID. Do NOT overwrite with DLD admin name.
        return found;
      }
      return {
        id: c.area_name_slug,
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
    // Safety net: any curated row that didn't match by upper/alias still
    // belongs in the picker so users can find it.
    for (const a of curated) {
      if (!usedCuratedIds.has(a.id)) merged.push(a);
    }
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
