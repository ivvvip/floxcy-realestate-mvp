import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { AdminFeedbackClient } from './AdminFeedbackClient';

export const metadata = {
  title: 'Admin · Feedback',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminFeedbackPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: 'Feedback' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">Admin · User Feedback</h1>
            <p className="mt-1 text-xs text-fg-muted">Page-level ratings and notes from the feedback widget.</p>
          </div>
        </Container>
      </div>
      <Container>
        <div className="py-5">
          <AdminFeedbackClient />
        </div>
      </Container>
    </div>
  );
}
