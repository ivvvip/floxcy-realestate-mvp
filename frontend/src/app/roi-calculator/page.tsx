import type { Metadata } from 'next';
import { Container } from '@/components/Container';
import { RoiCalculator } from './RoiCalculator';

export const metadata: Metadata = {
  title: 'ROI Calculator',
  description:
    'Model gross yield, net yield, and payback period for any Dubai property in seconds.',
};

export default function RoiCalculatorPage() {
  return (
    <Container size="lg">
      <header className="pt-14 pb-8 sm:pt-20">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">
          Investment Modeling
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl md:text-5xl">
          ROI Calculator
        </h1>
        <p className="mt-4 max-w-2xl text-fg-muted">
          Plug in the headline price, annual rent, and ongoing costs. We’ll
          return gross yield, net yield, and an estimated payback period —
          straight from our pricing engine.
        </p>
      </header>

      <RoiCalculator />
    </Container>
  );
}
