import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { BrokerDashboardClient } from './BrokerDashboardClient';

export const metadata = {
  title: 'Broker Dashboard',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function BrokerDashboardPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Broker dashboard' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Broker dashboard
            </h1>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <BrokerDashboardClient />
        </div>
      </Container>
    </div>
  );
}
