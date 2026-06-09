import { Suspense } from 'react';
import { HardHat } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { OffplanExplorer } from './OffplanExplorer';
import { getOfficialProjects } from '@/lib/api';

export const revalidate = 300;
export const metadata = {
  title: 'Off-Plan Properties Dubai 2026 — Official DLD Registry',
  description:
    'Official DLD off-plan project registry — verified developer, % completion, '
    + 'escrow status, expected handover and unit counts. Filter by status, area, '
    + 'developer and construction stage.',
};

export default async function OffplanPage() {
  // The official registry is small (255 projects), so we fetch the whole set
  // once and let the client component handle every filter/sort without a
  // round-trip. Every row is authoritative DLD data.
  const resp = await getOfficialProjects({ limit: 300 }).catch(() => null);
  const projects = resp?.items ?? [];
  const active = projects.filter((p) => (p.project_status || '').toUpperCase() === 'ACTIVE').length;

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Off-Plan' }]} />
            <div className="mt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <HardHat className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                <h1 className="text-xl font-semibold text-fg tracking-tight">
                  Off-Plan Projects
                </h1>
                <span className="pill pill-accent">{active} active</span>
                <span className="pill border-positive/40 text-positive bg-positive/5">
                  ✅ Official DLD Data
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                Every project here is registered with the Dubai Land Department —
                verified developer, official % completion, escrow status, expected
                handover and declared unit counts. Filter by status, area,
                developer or construction stage.
              </p>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <Suspense fallback={<div className="text-xs text-fg-subtle">Loading…</div>}>
            <OffplanExplorer projects={projects} />
          </Suspense>
        </div>
      </Container>
    </div>
  );
}
