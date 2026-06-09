import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminClaimsClient } from './AdminClaimsClient';

export const metadata = {
  title: 'Admin · Claims',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminClaimsPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: 'Claims' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Admin · Profile Claims
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              Verification requests from brokers, agencies and developers. Approving a
              claim creates/links the profile and marks it verified. No payment is taken
              at claim time.
            </p>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminClaimsClient />
        </div>
      </Container>
    </div>
  );
}
