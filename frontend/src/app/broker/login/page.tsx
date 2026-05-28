import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { BrokerLoginClient } from './BrokerLoginClient';

export const metadata = {
  title: 'Broker Login',
  robots: { index: false, follow: false },
};

export default function BrokerLoginPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Broker', href: '/broker/login' }, { label: 'Login' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Broker login
            </h1>
          </div>
        </Container>
      </div>
      <Container size="sm">
        <div className="py-6">
          <BrokerLoginClient />
        </div>
      </Container>
    </div>
  );
}
