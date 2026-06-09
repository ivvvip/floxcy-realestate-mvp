import { Map as MapIcon } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getMapAreas, getMapBuildings } from '@/lib/api';
import { MapClient } from './MapClient';

export const revalidate = 3600;
export const metadata = {
  title: 'Dubai Map · Floxcy',
  description:
    'Live Dubai real-estate map — 139 area polygons coloured by gross rental '
    + 'yield + 504 OSM-verified buildings. Click any area or building for '
    + 'instant DLD-sourced details.',
};

export default async function MapPage() {
  // Fetch both layers in parallel. Both are 1h-cached at the API client.
  const [areas, buildings] = await Promise.all([
    getMapAreas().catch(() => null),
    getMapBuildings().catch(() => null),
  ]);

  return (
    <div className="bg-bg min-h-screen">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Map' }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <MapIcon className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Dubai Map
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  {areas?.count ?? 0} canonical areas (
                  {areas?.areas.filter((a) => a.polygon).length ?? 0} with
                  polygons) · {buildings?.count ?? 0} OSM-verified buildings.
                  CartoDB Dark Matter tiles. OpenStreetMap data.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4">
          <MapClient
            areas={areas?.areas ?? []}
            buildings={buildings?.buildings ?? []}
          />
        </div>
      </Container>
    </div>
  );
}
