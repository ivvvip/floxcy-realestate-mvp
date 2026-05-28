import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminBrokersClient } from './AdminBrokersClient';

export const metadata = {
  title: 'Admin · Brokers',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminBrokersPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs
              items={[
                { label: 'Admin', href: '/admin' },
                { label: 'Brokers' },
              ]}
            />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Admin · Brokers & Applications
            </h1>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminBrokersClient />
        </div>
      </Container>
    </div>
  );
}
