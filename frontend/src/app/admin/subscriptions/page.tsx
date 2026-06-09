import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminSubscriptionsClient } from './AdminSubscriptionsClient';

export const metadata = {
  title: 'Admin · Subscriptions',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminSubscriptionsPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: 'Subscriptions' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Admin · Subscriptions
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              Status overview across users and claimed profiles. Tiers are set manually
              until Stripe is activated — no billing is wired yet.
            </p>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminSubscriptionsClient />
        </div>
      </Container>
    </div>
  );
}
