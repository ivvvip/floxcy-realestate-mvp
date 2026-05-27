import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { Lock } from 'lucide-react';
import { AdminClient } from './AdminClient';

export const metadata = {
  title: 'Admin',
  description: 'Internal data management.',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Admin' }]} />
            <div className="mt-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">
                Admin · Data Operations
              </h1>
              <span className="pill">Internal</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">
              Re-seed the market_snapshots table with 12 monthly entries per area
            </p>
          </div>
        </Container>
      </div>

      <Container size="md">
        <div className="py-5">
          <AdminClient />
        </div>
      </Container>
    </div>
  );
}
