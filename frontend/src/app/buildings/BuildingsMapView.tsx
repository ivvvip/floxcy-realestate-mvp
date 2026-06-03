'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { List, Map as MapIcon } from 'lucide-react';
import type { MapBuildingItem } from '@/lib/types';

const FloxcyMap = dynamic(() => import('@/components/FloxcyMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[700px] rounded-lg border border-border bg-bg-card/40 flex items-center justify-center text-sm text-fg-subtle">
      Loading map…
    </div>
  ),
});

interface Props {
  buildings: MapBuildingItem[];
}

/**
 * Map view of the 504 OSM-verified buildings. Shown when the buildings
 * page is loaded with ?view=map. The List toggle is a plain link so the
 * URL stays canonical and shareable.
 */
export function BuildingsMapView({ buildings }: Props) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-fg-muted">
          {buildings.length.toLocaleString()} verified buildings ·
          OpenStreetMap coordinates · click any pin for details
        </div>
        <div className="inline-flex rounded-md border border-border bg-bg-card overflow-hidden text-xs">
          <Link
            href="/buildings"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-fg-muted hover:text-fg"
          >
            <List className="h-3 w-3" strokeWidth={2.5} />
            List
          </Link>
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-accent text-accent-fg font-medium">
            <MapIcon className="h-3 w-3" strokeWidth={2.5} />
            Map
          </span>
        </div>
      </div>
      <FloxcyMap
        areas={[]}
        buildings={buildings}
        showAreasInitially={false}
        showBuildingsInitially
        showLayerControl={false}
        showSearch
        heightClass="h-[700px]"
      />
    </div>
  );
}
