import { Container } from '@/components/Container';
import { AdminClient } from './AdminClient';

export const metadata = {
  title: 'Admin · Floxcy',
  description: 'Internal data management.',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <section className="py-12">
      <Container size="md">
        <header className="mb-8">
          <span className="pill">Internal</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Admin Data
          </h1>
          <p className="mt-2 text-fg-muted">
            Re-seed the market_snapshots table with 12 monthly entries per area.
            Requires an admin token.
          </p>
        </header>
        <AdminClient />
      </Container>
    </section>
  );
}
