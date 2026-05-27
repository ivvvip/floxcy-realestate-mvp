import { Suspense } from 'react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { Lock } from 'lucide-react';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Admin Login',
  description: 'Admin authentication.',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: 'Login' }]} />
            <div className="mt-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">
                Sign in to Floxcy Admin
              </h1>
            </div>
            <p className="mt-1 text-xs text-fg-muted">
              Authorized personnel only. Failed attempts are rate-limited and audited.
            </p>
          </div>
        </Container>
      </div>
      <Container size="md">
        <div className="py-5 max-w-md">
          <Suspense fallback={<div className="text-xs text-fg-subtle">Loading…</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </Container>
    </div>
  );
}
