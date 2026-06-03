import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Banknote, BookOpen, Building2, FileText, Globe, KeyRound, MapPin,
  Scale, ShieldCheck, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';

export const metadata: Metadata = {
  title: 'Dubai Real Estate 101 — Learn',
  description:
    'How to buy property in Dubai, fees explained, freehold vs leasehold, '
    + 'off-plan risks, mortgages, Investor Visa, and a full glossary — '
    + 'plain English, no jargon.',
};

export const revalidate = 86400;

const SECTIONS = [
  {
    id: 'how-to-buy',
    icon: <KeyRound className="h-4 w-4" strokeWidth={2} />,
    title: 'How to buy property in Dubai',
    summary: 'Five steps from search to title deed, typical 30–60 day timeline.',
    points: [
      '1. Pick your area + property — use Floxcy Areas to filter by yield, growth, and freehold status.',
      '2. Make an offer + sign Form F (Memorandum of Understanding). 10% deposit goes to the seller\'s agent.',
      '3. NOC application — seller obtains a No Objection Certificate from the developer (1–5 days, AED 500–5,000).',
      '4. Transfer at the DLD Trustee Office — 4% transfer fee + 2% agency + AED 4,200 trustee + 5% VAT on agency.',
      '5. Receive the title deed (Oqood for off-plan, Mulkiya for ready). Register with Ejari to lease out.',
    ],
  },
  {
    id: 'fees',
    icon: <Banknote className="h-4 w-4" strokeWidth={2} />,
    title: 'Fees explained simply',
    summary: 'Budget ~7–8% on top of the purchase price.',
    points: [
      'DLD transfer fee: 4% of purchase price — flat, one-off.',
      'Agency commission: 2% of purchase price + 5% VAT on the commission.',
      'Trustee office fee: AED 4,200 (fixed).',
      'Mortgage registration: 0.25% of loan amount (only if financing).',
      'Property valuation: AED 3,000–3,500 (mortgage only).',
      'Annual service charges: typically 12–30 AED/sqft depending on building amenities.',
      'No annual property tax. No income tax on rent. No capital-gains tax on sale.',
    ],
  },
  {
    id: 'freehold-vs-leasehold',
    icon: <ShieldCheck className="h-4 w-4" strokeWidth={2} />,
    title: 'Freehold vs leasehold',
    summary: 'Freehold gives foreigners full ownership; leasehold is long-term rental.',
    points: [
      'Freehold: 100% ownership, perpetual, transferable. Most Dubai investment districts are freehold (Marina, Downtown, JVC, Business Bay).',
      'Leasehold: long-term lease (10–99 years). Found in some areas restricted to GCC nationals or UAE citizens.',
      'Freehold is required for the Investor Visa (entry threshold AED 750K).',
      'When in doubt, check the title deed type or call DLD on 800 4488.',
    ],
  },
  {
    id: 'off-plan',
    icon: <Building2 className="h-4 w-4" strokeWidth={2} />,
    title: 'Off-plan: risks & rewards',
    summary: 'Cheaper entry, longer wait, developer risk.',
    points: [
      'Off-plan = property purchased before completion, sold by the developer with a staged payment plan.',
      'Reward: typically 15–25% below ready-market price. Construction-linked payments reduce upfront cash.',
      'Risk: project delays (industry average ~12–18 months), developer financial stability, and on-handover quality.',
      'Mitigation: check the developer\'s track record (use Floxcy Building X-Ray), confirm escrow account #, and read the SPA carefully.',
      'RERA mandates an escrow account for every off-plan project — funds released to developer only on construction milestones.',
    ],
  },
  {
    id: 'mortgage',
    icon: <Wallet className="h-4 w-4" strokeWidth={2} />,
    title: 'Mortgage guide',
    summary: 'Foreign nationals can borrow up to 80% LTV; UAE residents up to 85%.',
    points: [
      'Max LTV: 80% for non-residents, 85% for residents (Central Bank caps).',
      'Term: typically 5–25 years; age cap usually 65–70 at maturity.',
      'Rates: ~4.5–6% (Q2 2026 indicative). Fixed for 1–5 years, then variable.',
      'Required documents: passport + visa, 6 months bank statements, salary certificate, mortgage pre-approval.',
      'Down payment must be from personal funds (not borrowed).',
      'Compare lenders: Emirates NBD, ADCB, FAB, Mashreq, HSBC, Standard Chartered.',
    ],
  },
  {
    id: 'visa',
    icon: <Globe className="h-4 w-4" strokeWidth={2} />,
    title: 'Investor Visa guide',
    summary: '2-year visa from AED 750K, 10-year Golden Visa from AED 2M.',
    points: [
      '2-year property investor visa: AED 750K+ freehold property (can be joint).',
      '10-year Golden Visa: AED 2M+ freehold property OR AED 1M off-plan with handover ≤3 years.',
      'Renewable as long as you continue to own the qualifying property.',
      'Includes spouse + children (no age limit on children of investor).',
      'Processing: 2–4 weeks via Dubai Land Department + GDRFA.',
      'Property must be fully paid (or mortgage approved) at time of application.',
    ],
  },
];

const GLOSSARY = [
  ['Ejari', 'Mandatory rental contract registration with DLD. Required for utilities, visa renewals, and any legal recourse against a landlord.'],
  ['RERA', 'Real Estate Regulatory Agency — regulates brokers, developers, and rental practices. Every active broker has an RERA license.'],
  ['DLD', 'Dubai Land Department — the government registrar for all property transactions, owners, and titles. Source of all data on this site.'],
  ['Oqood', 'Off-plan title deed — proof of ownership before the building is handed over.'],
  ['Mulkiya', 'Ready title deed — final ownership certificate.'],
  ['MoU / Form F', 'Memorandum of Understanding — the agreement between buyer and seller before transfer.'],
  ['NOC', 'No Objection Certificate from the developer, confirming no outstanding service charges.'],
  ['LTV', 'Loan-to-Value ratio. 80% LTV = 20% down payment.'],
  ['Gross yield', 'Annual rent / property price × 100. Doesn\'t deduct service charges or vacancy.'],
  ['Net yield', 'Annual rent minus all costs (service charge, maintenance, vacancy, management) / property price × 100.'],
  ['CAGR', 'Compound Annual Growth Rate — the smoothed annual % growth over a multi-year period.'],
  ['Service charge', 'Annual building maintenance fee, paid quarterly. Range: 12–30 AED/sqft depending on amenities.'],
  ['Off-plan', 'Property sold before construction completion. Pays in installments tied to construction milestones.'],
  ['Decree 43', 'RERA rental increase law — caps annual rent increases by % bands based on how far below market your current rent sits.'],
];

export default function LearnPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Learn' }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Dubai Real Estate 101
                  </h1>
                  <span className="pill pill-accent text-[10px]">For investors</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  Plain-English guides to buying, financing, and renting Dubai
                  property. Glossary at the bottom. Last reviewed Q2 2026.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-6 grid gap-5 lg:grid-cols-12">
          {/* Table of contents */}
          <aside className="lg:col-span-3 order-2 lg:order-1">
            <div className="border border-border rounded-lg bg-bg-card sticky top-4 max-h-[80vh] overflow-y-auto">
              <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                On this page
              </div>
              <ul className="p-2 space-y-0.5 text-xs">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block px-2 py-1.5 rounded hover:bg-bg-elev text-fg-muted hover:text-fg"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href="#glossary"
                    className="block px-2 py-1.5 rounded hover:bg-bg-elev text-fg-muted hover:text-fg"
                  >
                    Glossary
                  </a>
                </li>
              </ul>
            </div>
          </aside>

          {/* Content */}
          <div className="lg:col-span-9 order-1 lg:order-2 space-y-5">
            {SECTIONS.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="border border-border rounded-lg bg-bg-card scroll-mt-20"
              >
                <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                  <span className="text-accent">{s.icon}</span>
                  <h2 className="text-sm font-semibold text-fg">{s.title}</h2>
                </div>
                <div className="p-4 space-y-2.5">
                  <p className="text-xs text-fg-muted italic">{s.summary}</p>
                  <ul className="space-y-1.5 text-sm text-fg leading-relaxed">
                    {s.points.map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}

            {/* Glossary */}
            <section
              id="glossary"
              className="border border-border rounded-lg bg-bg-card scroll-mt-20"
            >
              <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent" strokeWidth={2} />
                <h2 className="text-sm font-semibold text-fg">Glossary</h2>
              </div>
              <div className="p-4">
                <dl className="grid gap-3 sm:grid-cols-2">
                  {GLOSSARY.map(([term, def]) => (
                    <div key={term} className="border-b border-border/40 pb-2">
                      <dt className="text-xs font-semibold text-fg">{term}</dt>
                      <dd className="mt-0.5 text-xs text-fg-muted leading-relaxed">{def}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            {/* CTA */}
            <section className="border border-border rounded-lg bg-bg-card p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-accent" strokeWidth={2.5} />
                <h2 className="text-sm font-semibold text-fg">Ready to start?</h2>
              </div>
              <p className="text-xs text-fg-muted max-w-md mx-auto mb-4">
                Use the DLD-powered tools to scope your investment with real numbers.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href="/roi-calculator"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg hover:bg-accent/90"
                >
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Calculate ROI
                </Link>
                <Link
                  href="/areas"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-accent/40"
                >
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                  Browse 284 areas
                </Link>
                <Link
                  href="/rent-check"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-accent/40"
                >
                  <Scale className="h-3.5 w-3.5" strokeWidth={2} />
                  Check your rent
                </Link>
              </div>
            </section>

            <div className="text-[10px] text-fg-subtle text-center">
              Educational content only — not legal or financial advice. For
              binding rules, consult Dubai Land Department or a licensed broker.
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
