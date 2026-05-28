import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminLeadsClient } from './AdminLeadsClient';

export const metadata = {
  title: 'Admin · Leads',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminLeadsPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[
                { label: 'Admin', href: '/admin' },
                { label: 'Leads' },
              ]}
            />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Admin · Investor Leads
            </h1>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminLeadsClient />
        </div>
      </Container>
    </div>
  );
}
