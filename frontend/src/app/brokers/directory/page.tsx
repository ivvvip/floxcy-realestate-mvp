import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDldStats } from '@/lib/api';
import { BrokersDirectoryClient } from './BrokersDirectoryClient';

export const metadata: Metadata = {
  title: 'RERA Broker Directory — DLD-verified Dubai brokers',
  description:
    'Search every active RERA-licensed real estate broker in Dubai. Verify a broker number, find the registered firm, and confirm the license is current — all sourced from Dubai Land Department open data.',
};

export default async function BrokersDirectoryPage() {
  const stats = await getDldStats().catch(() => null);
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'RERA Broker Directory' }]} />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    RERA Broker Directory
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Search{' '}
                  <span className="font-mono text-fg">
                    {stats?.total_active_brokers.toLocaleString() ?? '34,396'}
                  </span>{' '}
                  active RERA-licensed brokers in Dubai. Verify their number,
                  firm, and license status before signing anything.
                </p>
              </div>
              {stats && (
                <div className="hidden sm:block text-right text-[11px] text-fg-subtle">
                  <div>
                    <span className="text-fg-muted">Source:</span>{' '}
                    {stats.data_source}
                  </div>
                  <div>
                    <span className="text-fg-muted">Updated:</span>{' '}
                    {stats.last_updated}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <BrokersDirectoryClient />
        </div>
      </Container>
    </div>
  );
}
