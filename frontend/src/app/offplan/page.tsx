import { Suspense } from 'react';
import { HardHat } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { OffplanExplorer } from './OffplanExplorer';
import { getOffplanProjects, getDevelopers } from '@/lib/api';

export const revalidate = 300;
export const metadata = {
  title: 'Off-Plan Properties Dubai 2026',
  description:
    'Live off-plan project explorer powered by DLD buildings data — filter '
    + 'by developer, area, and unit count. Includes off-plan vs ready price context.',
};

export default async function OffplanPage() {
  const [projects, developers] = await Promise.all([
    getOffplanProjects({ sort: 'units', limit: 120 }).catch(() => null),
    getDevelopers({ sort: 'projects', limit: 60 }).catch(() => null),
  ]);

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Off-Plan' }]} />
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                <h1 className="text-xl font-semibold text-fg tracking-tight">
                  Off-Plan Projects
                </h1>
                <span className="pill pill-accent">
                  {projects?.total ?? 0} active
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                Projects with at least one building registered as under
                construction in the DLD buildings dataset. Filter by
                developer or area to find what matches your strategy.
              </p>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <Suspense fallback={<div className="text-xs text-fg-subtle">Loading…</div>}>
            <OffplanExplorer
              initialProjects={projects?.items ?? []}
              developers={developers?.items ?? []}
              dataSource={projects?.data_source ?? ''}
            />
          </Suspense>
        </div>
      </Container>
    </div>
  );
}
