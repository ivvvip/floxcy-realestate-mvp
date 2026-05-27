import Link from 'next/link';
import { Container } from '@/components/Container';

export default function NotFound() {
  return (
    <Container size="md">
      <div className="surface-card mx-auto mt-24 max-w-lg p-8 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wider text-negative">
          404 · Not found
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-fg">Page not found</h1>
        <p className="mt-2 text-sm text-fg-muted">
          The page you&rsquo;re looking for doesn&rsquo;t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 transition-colors"
        >
          Back home
        </Link>
      </div>
    </Container>
  );
}
