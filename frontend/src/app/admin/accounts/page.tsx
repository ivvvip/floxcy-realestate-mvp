import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminAccountsClient } from './AdminAccountsClient';

export const metadata = {
  title: 'Admin · Accounts',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminAccountsPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: 'Accounts' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Admin · Accounts
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              Claimed broker, agency and developer profiles. Toggle verification, featured
              placement and subscription tier manually (until Stripe is activated).
            </p>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminAccountsClient />
        </div>
      </Container>
    </div>
  );
}
