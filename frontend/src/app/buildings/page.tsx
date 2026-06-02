import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDldStats, getDldBuildings, getDldAreas } from '@/lib/api';
import { BuildingsIndexClient } from './BuildingsIndexClient';

export const metadata: Metadata = {
  title: 'Building X-Ray — Per-project rent intelligence',
  description:
    'Drill into 8,075 Dubai buildings: per-building rent contract count, average rent, occupancy proxy, and income range. Powered by Dubai Land Department Ejari data.',
};

export const revalidate = 3600;

export default async function BuildingsIndexPage() {
  // Top 50 buildings + the full area picker, both prefetched. Areas filtered
  // to those actually linked to ≥1 building so the dropdown stays usable.
  const [stats, initial, areas] = await Promise.all([
    getDldStats().catch(() => null),
    getDldBuildings({ sort_by: 'rent_count', limit: 50 }).catch(() => null),
    getDldAreas({ limit: 500 }).catch(() => null),
  ]);

  const areaOptions = (areas?.items ?? [])
    .map((a) => ({ name: a.name, name_norm: a.name_norm }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Building X-Ray' }]} />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Building X-Ray
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Per-project rent intelligence on{' '}
                  <span className="font-mono text-fg">
                    {stats?.total_buildings.toLocaleString() ?? '8,075'}
                  </span>{' '}
                  Dubai buildings. No competitor exposes this view.
                </p>
              </div>
              <div className="text-left sm:text-right text-[11px] text-fg-subtle">
                <div>
                  <span className="text-fg-muted">Source:</span> Dubai Land Department · Ejari
                </div>
                <div>
                  <span className="text-fg-muted">Updated:</span> {stats?.last_updated ?? '2026-06-01'}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4 sm:py-6">
          <BuildingsIndexClient
            initialItems={initial?.items ?? []}
            initialTotal={initial?.total_available ?? 0}
            areaOptions={areaOptions}
          />
        </div>
      </Container>
    </div>
  );
}
