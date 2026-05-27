import { Container } from '@/components/Container';
import { CompareClient } from './CompareClient';
import { getAreas } from '@/lib/api';
import type { Area } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Compare Areas · Floxcy',
  description: 'Side-by-side comparison of Dubai areas across price, yield, and risk.',
};

async function loadAreas(): Promise<Area[]> {
  try {
    return await getAreas();
  } catch {
    return [];
  }
}

export default async function ComparePage() {
  const areas = await loadAreas();

  return (
    <section className="py-12">
      <Container>
        <header className="mb-8">
          <span className="pill pill-accent">Side-by-side</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Compare Areas
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Pick 2 to 4 areas to compare their latest metrics and 12-month history.
          </p>
        </header>

        <CompareClient areas={areas} />
      </Container>
    </section>
  );
}
