'use client';

import dynamic from 'next/dynamic';
import type { MapAreaItem, MapBuildingItem } from '@/lib/types';

// Leaflet touches `window` at import time, so the entire map module has
// to be lazy-loaded with SSR disabled.
const FloxcyMap = dynamic(() => import('@/components/FloxcyMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] rounded-lg border border-border bg-bg-card/40 flex items-center justify-center text-sm text-fg-subtle">
      Loading map…
    </div>
  ),
});

export function MapClient({
  areas,
  buildings,
}: {
  areas: MapAreaItem[];
  buildings: MapBuildingItem[];
}) {
  return (
    <FloxcyMap
      areas={areas}
      buildings={buildings}
      showAreasInitially
      showBuildingsInitially
      heightClass="h-[65vh] min-h-[420px] sm:h-[680px]"
    />
  );
}
