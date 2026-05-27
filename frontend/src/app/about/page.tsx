import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { Building2, Target, ShieldCheck, BarChart3 } from 'lucide-react';

export const metadata = {
  title: 'About',
  description: 'Floxcy is an institutional-grade real estate intelligence platform for UAE property investors.',
};

export default function AboutPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'About' }]} />
            <div className="mt-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">
                About Floxcy
              </h1>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-7 max-w-3xl space-y-7">
          <section>
            <h2 className="text-2xl font-semibold text-fg leading-tight">
              UAE real estate, on a single intelligence layer.
            </h2>
            <p className="mt-3 text-sm text-fg-muted leading-relaxed">
              Floxcy is a market intelligence platform purpose-built for UAE
              property investors — principals, family offices, brokers, and
              firms deploying real capital. We translate fragmented transaction
              data, rental contracts, and broker-verified signals into a single
              screener with transparent scoring and explicit data confidence.
            </p>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <Pillar
              icon={Target}
              title="Built for decisions"
              body="Every score is reproducible. Every recommendation cites yield, appreciation, demand, and risk — never &lsquo;trust us&rsquo;."
            />
            <Pillar
              icon={ShieldCheck}
              title="Confidence-aware"
              body="Low-quality data gets flagged explicitly. We&rsquo;d rather show a warning than fake certainty."
            />
            <Pillar
              icon={BarChart3}
              title="Institutional-grade"
              body="Pricing, methodology, and audit log are designed for brokerages, advisory firms, and family offices."
            />
          </section>

          <section>
            <h3 className="text-lg font-semibold text-fg">What Floxcy is not</h3>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-border-strong" />
                <span>
                  Not a brokerage. We do not transact, list properties, or earn
                  commission on deals.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-border-strong" />
                <span>
                  Not investment advice. Our scores derive from observable
                  metrics; consult a licensed advisor before deploying capital.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-border-strong" />
                <span>
                  Not a black-box AI. Every formula is public — see{' '}
                  <Link
                    href="/methodology"
                    className="text-accent hover:underline"
                  >
                    methodology
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </section>

          <section className="border border-border rounded-lg bg-bg-card p-5">
            <h3 className="text-sm font-medium text-fg">Contact &amp; coverage</h3>
            <p className="mt-2 text-xs text-fg-muted">
              Based in Dubai, UAE. Coverage currently spans curated UAE areas;
              expansion to GCC markets is on the roadmap. For enterprise data
              licensing or white-label deployments, see{' '}
              <Link href="/pricing" className="text-accent hover:underline">
                pricing
              </Link>
              .
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Building2;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-bg-card p-5">
      <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
      <div className="mt-3 text-sm font-medium text-fg">{title}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}
