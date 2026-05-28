import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminOpportunitiesClient } from './AdminOpportunitiesClient';

export const metadata = {
  title: 'Admin · Opportunities',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminOpportunitiesPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[
                { label: 'Admin', href: '/admin' },
                { label: 'Opportunities' },
              ]}
            />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Admin · Opportunity Review
            </h1>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminOpportunitiesClient />
        </div>
      </Container>
    </div>
  );
}
