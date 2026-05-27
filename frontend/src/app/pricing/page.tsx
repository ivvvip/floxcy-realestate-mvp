import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { PLANS } from '@/lib/plans';
import { cn } from '@/lib/cn';

export const metadata = {
  title: 'Pricing',
  description: 'Floxcy subscription tiers: Free, Pro, API, Enterprise.',
};

export default function PricingPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Pricing' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Pricing
            </h1>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              Subscription tiers for individual investors, integrators, and
              firms. Payment processing launches Q3 2026 — until then, all
              tiers are available on request via{' '}
              <Link href="/about" className="text-accent hover:underline">
                About
              </Link>
              .
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-7 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden">
          {PLANS.map((p) => (
            <div
              key={p.tier}
              className={cn(
                'bg-bg-card p-5 flex flex-col',
                p.highlight && 'bg-bg-elev/30'
              )}
            >
              {p.highlight && (
                <span className="pill pill-accent w-fit mb-2">
                  Recommended
                </span>
              )}
              <div className="text-base font-semibold text-fg">{p.name}</div>
              <div className="text-[11px] text-fg-subtle">{p.tagline}</div>
              <div className="mt-4 flex items-baseline gap-1 tabular">
                {p.price_aed === 'custom' ? (
                  <span className="text-2xl font-semibold text-fg">Custom</span>
                ) : (
                  <>
                    <span className="text-2xl font-semibold text-fg">
                      AED {p.price_aed.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-fg-subtle">/ mo</span>
                  </>
                )}
              </div>
              <div className="mt-1 text-[11px] text-fg-subtle tabular">
                {p.rate_limit_per_min.toLocaleString()} req/min
              </div>

              <ul className="mt-4 space-y-1.5 text-[11px] flex-1">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {f.included ? (
                      <Check
                        className="h-3 w-3 mt-0.5 flex-shrink-0 text-positive"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <X
                        className="h-3 w-3 mt-0.5 flex-shrink-0 text-fg-subtle"
                        strokeWidth={2}
                      />
                    )}
                    <span
                      className={cn(
                        f.included ? 'text-fg-muted' : 'text-fg-subtle line-through'
                      )}
                    >
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={p.cta_href}
                className={cn(
                  'mt-5 inline-flex h-9 items-center justify-center rounded-md text-xs font-medium transition-colors',
                  p.highlight
                    ? 'bg-accent text-accent-fg hover:bg-accent/90'
                    : 'border border-border bg-bg-card text-fg-muted hover:text-fg hover:border-border-strong'
                )}
              >
                {p.cta_label}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-fg-subtle text-center">
          All prices in AED, exclusive of VAT. Tier matrix and rate limits are
          enforced server-side via API key. See{' '}
          <Link href="/terms" className="text-accent hover:underline">
            terms
          </Link>{' '}
          for acceptable use.
        </p>
        <div className="pb-10" />
      </Container>
    </div>
  );
}
