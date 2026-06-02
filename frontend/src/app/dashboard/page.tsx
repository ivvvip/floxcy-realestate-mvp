import { LayoutDashboard } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { DashboardClient } from './DashboardClient';
import { getDashboardData } from '@/lib/api';
import type { DashboardDataResponse } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Market Dashboard',
  description:
    'Live Dubai real estate KPIs powered by DLD open data — sales volume, '
    + 'rental yields, off-plan share, broker activity, supply pipeline.',
};

async function loadData(): Promise<{ data: DashboardDataResponse | null; error: string | null }> {
  try {
    const data = await getDashboardData();
    return { data, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Dashboard data unavailable',
    };
  }
}

export default async function DashboardPage() {
  const { data, error } = await loadData();

  return (
    <div className="bg-bg min-h-screen">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Dashboard' }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Market Dashboard
                  </h1>
                  <span className="pill pill-accent inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    Live DLD
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  Real-time investor intelligence powered by Dubai Land Department
                  open data. Every chart, KPI and ranking is computed live from
                  authoritative DLD ETL tables — no curation, no fabrication.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="pt-5">
          {error || !data ? (
            <DashboardError message={error ?? 'Unknown error'} />
          ) : (
            <DashboardClient data={data} />
          )}
        </div>
      </Container>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="surface-card p-8 text-center">
      <h2 className="text-base font-semibold text-fg">Dashboard temporarily unavailable</h2>
      <p className="mt-2 text-xs text-fg-muted max-w-md mx-auto">
        We couldn&apos;t fetch DLD aggregates from the backend. The dashboard renders
        from <code className="font-mono text-fg-muted">/api/v1/dld/dashboard-data</code>
        {' '}— if you&apos;re seeing this in production, the API may be redeploying.
      </p>
      <p className="mt-3 text-[11px] text-fg-subtle font-mono">{message}</p>
    </div>
  );
}
