import Link from 'next/link';
import { Container } from '@/components/Container';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { getAreaStats } from '@/lib/api';

export const revalidate = 300;

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

const FALLBACK_AREA_NAMES = [
  'Downtown Dubai',
  'Dubai Marina',
  'Palm Jumeirah',
  'Business Bay',
  'Jumeirah Village Circle',
  'Dubai Hills Estate',
  'Arjan',
  'Meydan',
  'Dubai South',
  'Jumeirah Lake Towers',
];

async function loadStats() {
  try {
    const stats = await getAreaStats();
    return {
      total: stats.total_count,
      names: stats.area_names,
    };
  } catch {
    return { total: FALLBACK_AREA_NAMES.length, names: FALLBACK_AREA_NAMES };
  }
}

export default async function HomePage() {
  const { total, names } = await loadStats();
  const tickerNames = [...names, ...names];

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 top-32 h-72 w-72 rounded-full bg-accent/20 blur-3xl animate-float-slow"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-64 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl animate-float-slower"
        />

        <Container>
          <div className="relative mx-auto max-w-4xl pt-20 pb-20 text-center sm:pt-28 sm:pb-28">
            <div className="mx-auto inline-flex animate-fade-up items-center gap-2 rounded-full border border-border bg-bg-card/60 px-3.5 py-1.5 text-xs font-medium text-fg-muted backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent animate-pulse-ring" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_rgba(0,212,170,0.9)]" />
              </span>
              Live API · Updated in real time
            </div>

            <h1
              className="mt-6 animate-fade-up text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl"
              style={{ animationDelay: '60ms' }}
            >
              <span className="text-gradient">Dubai real estate,</span>
              <br />
              <span className="bg-gradient-to-r from-accent via-emerald-300 to-accent bg-clip-text text-transparent">
                by the numbers.
              </span>
            </h1>

            <p
              className="mx-auto mt-6 max-w-2xl animate-fade-up text-base leading-relaxed text-fg-muted sm:text-lg"
              style={{ animationDelay: '140ms' }}
            >
              Stop guessing. Compare curated investment-grade neighborhoods,
              model net yield and payback in seconds, and act on data — not
              hype.
            </p>

            <div
              className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: '220ms' }}
            >
              <Link
                href="/areas"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-fg shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 hover:shadow-[0_0_0_1px_rgba(0,212,170,0.35),0_12px_40px_-8px_rgba(0,212,170,0.5)]"
              >
                Explore {total} Dubai Areas
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                href="/roi-calculator"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-bg-card/60 px-6 text-sm font-semibold text-fg backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-bg-elev"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-accent"
                >
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <line x1="8" y1="6" x2="16" y2="6" />
                  <line x1="8" y1="10" x2="10" y2="10" />
                  <line x1="12" y1="10" x2="14" y2="10" />
                  <line x1="8" y1="14" x2="10" y2="14" />
                  <line x1="12" y1="14" x2="14" y2="14" />
                  <line x1="8" y1="18" x2="10" y2="18" />
                  <line x1="12" y1="18" x2="14" y2="18" />
                </svg>
                Calculate Your ROI
              </Link>
            </div>

            <p
              className="mt-4 animate-fade-up text-xs text-fg-subtle"
              style={{ animationDelay: '280ms' }}
            >
              No signup · Free forever · Live market data
            </p>

            <dl
              className="mx-auto mt-16 grid max-w-3xl animate-fade-up grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4"
              style={{ animationDelay: '360ms' }}
            >
              <Stat
                label="Dubai Areas"
                value={<AnimatedCounter value={total} />}
                hint="Curated & tracked"
              />
              <Stat
                label="Avg Net Yield"
                value={<AnimatedCounter value={6.5} decimals={1} suffix="%" />}
                hint="Across tracked areas"
              />
              <Stat
                label="ROI Modeling"
                value={
                  <>
                    &lt;<AnimatedCounter value={60} />
                    <span className="text-fg-muted">s</span>
                  </>
                }
                hint="From inputs to result"
              />
              <Stat
                label="Data Latency"
                value={
                  <>
                    <AnimatedCounter value={24} />
                    <span className="text-fg-muted">/7</span>
                  </>
                }
                hint="Live API uptime"
              />
            </dl>
          </div>

          <div
            aria-hidden
            className="relative -mt-4 mb-16 overflow-hidden rounded-xl border border-border bg-bg-card/40 py-3 backdrop-blur"
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-bg to-transparent"
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-bg to-transparent"
            />
            <div className="flex w-max animate-marquee items-center gap-10 pr-10 text-xs font-medium uppercase tracking-wider text-fg-subtle">
              {tickerNames.map((name, i) => (
                <span key={`${name}-${i}`} className="flex items-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-accent/60" />
                  {name}
                </span>
              ))}
            </div>
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="bg-bg-card/80 p-5 backdrop-blur transition-colors hover:bg-bg-elev/80">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums text-fg sm:text-4xl">
        {value}
      </dd>
      <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}
