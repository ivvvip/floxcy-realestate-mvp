import { Container } from '@/components/Container';
import { AdvisorClient } from './AdvisorClient';

export const metadata = {
  title: 'AI Investment Advisor · Floxcy',
  description: 'Rules-based area recommendations matched to your budget, goal, and risk profile.',
};

export default function AdvisorPage() {
  return (
    <section className="py-12">
      <Container>
        <header className="mb-8">
          <span className="pill pill-accent">AI Advisor</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            What should I invest in?
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Tell us your budget, goal, and risk appetite. We&apos;ll rank the
            best-fit areas based on live market data and transparent rules.
          </p>
        </header>
        <AdvisorClient />
      </Container>
    </section>
  );
}
