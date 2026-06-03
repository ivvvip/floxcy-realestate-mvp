'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowUpRight } from 'lucide-react';
import type { MapAreaItem, MapBuildingItem } from '@/lib/types';

const FloxcyMap = dynamic(() => import('@/components/FloxcyMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] rounded-lg border border-border bg-bg-card/40 flex items-center justify-center text-sm text-fg-subtle">
      Loading map…
    </div>
  ),
});

interface Props {
  area: MapAreaItem;
  buildings: MapBuildingItem[];
}

/**
 * 350-px mini-map for /areas/[id]. Frames the area polygon (or buildings
 * if no polygon) and embeds whichever verified buildings sit inside the
 * area. Renders nothing if we have neither coords nor any verified
 * buildings — keeps the area page clean for the long tail.
 */
export function AreaMiniMap({ area, buildings }: Props) {
  const hasPolygon = !!area.polygon;
  const hasCentroid = area.lat != null && area.lon != null;
  if (!hasPolygon && !hasCentroid && buildings.length === 0) return null;

  // Pre-compute bounds so the map auto-frames on first load.
  const points: [number, number][] = [];
  if (hasCentroid) points.push([area.lat as number, area.lon as number]);
  for (const b of buildings) points.push([b.lat, b.lon]);

  return (
    <section className="card overflow-hidden">
      <div className="chart-header">
        <span className="chart-header-label">
          📍 Map · {area.name}
          <span className="ml-2 text-[10px] text-fg-subtle">
            {buildings.length.toLocaleString()} verified buildings
          </span>
        </span>
        <Link
          href="/map"
          className="text-[11px] font-medium text-accent hover:text-accent/80 inline-flex items-center gap-1"
        >
          View on full map
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      <FloxcyMap
        areas={[area]}
        buildings={buildings}
        showLayerControl={false}
        showSearch={false}
        scrollWheelZoom={false}
        heightClass="h-[350px]"
        fitBounds={points.length > 0 ? points : undefined}
      />
    </section>
  );
}
