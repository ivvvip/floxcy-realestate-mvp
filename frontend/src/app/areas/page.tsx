import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/Container';
import { AreasFilterClient } from './AreasFilterClient';
import { getAreas } from '@/lib/api';
import type { Area } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Areas',
  description:
    'Browse curated Dubai investment areas — residential, commercial, and mixed-use neighborhoods.',
};

export const revalidate = 60;

export default async function AreasPage() {
  let areas: Area[] = [];
  let error: string | null = null;
  try {
    areas = await getAreas();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load areas.';
  }

  return (
    <Container>
      <header className="pt-14 pb-10 sm:pt-20">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">
          Markets
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl md:text-5xl">
          Dubai investment areas
        </h1>
        <p className="mt-4 max-w-2xl text-fg-muted">
          {areas.length > 0
            ? `Currently tracking ${areas.length} neighborhoods across Dubai. Tap any card to see the area in detail.`
            : 'Curated investment-grade neighborhoods across Dubai.'}
        </p>
      </header>

      {error && (
        <div className="surface-card mb-8 border-warn/30 p-5 text-sm text-warn">
          <p className="font-medium">Could not reach the API.</p>
          <p className="mt-1 text-warn/80">{error}</p>
        </div>
      )}

      {areas.length === 0 && !error ? (
        <div className="surface-card flex flex-col items-center justify-center p-12 text-center">
          <p className="text-fg-muted">No areas available yet.</p>
          <Link
            href="/"
            className="mt-4 text-sm font-medium text-accent hover:underline"
          >
            ← Back home
          </Link>
        </div>
      ) : (
        <AreasFilterClient areas={areas} />
      )}
    </Container>
  );
}
