import Link from 'next/link';
import { Container } from '@/components/Container';

export default function NotFound() {
  return (
    <Container size="md">
      <div className="surface-card mx-auto mt-24 max-w-lg p-10 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-warn">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-fg">Page not found</h1>
        <p className="mt-3 text-fg-muted">
          The page you’re looking for doesn’t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow hover:bg-accent/90"
        >
          Back home
        </Link>
      </div>
    </Container>
  );
}
