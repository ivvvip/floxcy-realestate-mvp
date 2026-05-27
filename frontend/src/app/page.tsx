import Link from 'next/link';
import { Container } from '@/components/Container';

const FEATURES = [
  {
    title: 'Curated Dubai Areas',
    description:
      'A hand-picked set of investment-grade neighborhoods with the context you need — area type, location, and on-the-ground notes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    title: 'Transparent ROI',
    description:
      'Model gross yield, net yield, and payback period in seconds. Every assumption is editable — no black boxes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
  },
  {
    title: 'Built on real data',
    description:
      'Backed by a live FastAPI service powering every figure. The same numbers our team uses internally.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[1100px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />

        <Container>
          <div className="relative mx-auto max-w-3xl pt-20 pb-16 text-center sm:pt-28 sm:pb-24">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-bg-card/60 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(0,212,170,0.8)]" />
              Live API · Dubai market intelligence
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              <span className="text-gradient">Invest smarter</span>
              <br />
              in Dubai real estate.
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
              Floxcy turns Dubai property data into clear investment signals.
              Explore curated areas, model real returns, and act with
              confidence.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/areas"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-fg shadow-glow transition-colors hover:bg-accent/90"
              >
                Explore Areas
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                href="/roi-calculator"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-bg-card/60 px-6 text-sm font-semibold text-fg transition-colors hover:border-border-strong hover:bg-bg-elev"
              >
                ROI Calculator
              </Link>
            </div>

            <dl className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-border pt-8">
              <div>
                <dt className="text-xs uppercase tracking-wider text-fg-subtle">Areas</dt>
                <dd className="mt-1 text-2xl font-semibold text-fg">10+</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-fg-subtle">Coverage</dt>
                <dd className="mt-1 text-2xl font-semibold text-fg">Dubai</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-fg-subtle">ROI Models</dt>
                <dd className="mt-1 text-2xl font-semibold text-fg">Live</dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-accent">
              Why Floxcy
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              A clearer picture of every deal
            </h2>
            <p className="mt-4 text-fg-muted">
              We strip out the noise of property listings and give you what
              matters: the numbers behind the investment.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="surface-card group relative flex flex-col p-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-muted text-accent ring-1 ring-accent/20">
                  {f.icon}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-fg">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-24">
        <Container>
          <div className="surface-card relative overflow-hidden p-10 sm:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/15 blur-3xl"
            />
            <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                  Ready to crunch the numbers?
                </h3>
                <p className="mt-3 max-w-xl text-fg-muted">
                  Plug in a property price and annual rent. Get gross yield,
                  net yield, and payback period instantly.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
                <Link
                  href="/roi-calculator"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-accent-fg shadow-glow transition-colors hover:bg-accent/90"
                >
                  Launch Calculator
                </Link>
                <Link
                  href="/areas"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-bg-elev px-6 text-sm font-semibold text-fg transition-colors hover:border-border-strong"
                >
                  Browse Areas
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
