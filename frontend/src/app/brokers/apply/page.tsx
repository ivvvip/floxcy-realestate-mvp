import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { BrokerApplyClient } from './BrokerApplyClient';

export const metadata = {
  title: 'Join as Verified Specialist',
  description:
    'Apply to join Floxcy as a verified UAE investment specialist. Curated network of brokers serving serious investors.',
};

export default function BrokerApplyPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Apply' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Join Floxcy as a verified UAE investment specialist
            </h1>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              Floxcy connects serious investors with a curated network of UAE
              real-estate specialists. Submit your details below — our team
              reviews every application personally and will reach out within
              a few business days.
            </p>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-6">
          <BrokerApplyClient />
        </div>
      </Container>
    </div>
  );
}
