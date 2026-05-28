import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { ConsultationClient } from './ConsultationClient';

export const metadata = {
  title: 'Request a Consultation',
  description:
    'Tell Floxcy about your UAE real-estate investment goals. A verified specialist will reach out.',
};

export default function ConsultationPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Consultation' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Request an investment consultation
            </h1>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              Tell us about your goals and budget. A verified UAE investment
              specialist will reach out within a few business days. No spam —
              we only share your details with the broker we match you to.
            </p>
          </div>
        </Container>
      </div>
      <Container size="md">
        <div className="py-6">
          <ConsultationClient />
        </div>
      </Container>
    </div>
  );
}
