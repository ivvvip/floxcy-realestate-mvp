import Link from 'next/link';
import { BadgeCheck, ShieldCheck, Info, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { VisaChecker } from './VisaChecker';
import { getVisaEligibility } from '@/lib/api';
import { formatLargeAED } from '@/lib/format';
import { toAreaSlug } from '@/lib/slugs';
import type { VisaEligibility } from '@/lib/types';

export const revalidate = 3600;
export const metadata = {
  title: 'Dubai Property Golden Visa — Eligibility Checker | Floxcy',
  description:
    'Which UAE residence visa does your property budget unlock? AED 750K = 2-year '
    + 'investor visa, AED 2M = 10-year Golden Visa. Check eligibility and see Dubai '
    + 'areas with qualifying options.',
};

export default async function VisaPage() {
  let data: VisaEligibility | null = null;
  try {
    data = await getVisaEligibility();
  } catch {
    data = null;
  }

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Golden Visa' }]} />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <BadgeCheck className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">Property & Residence Visa</h1>
            </div>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              In the UAE, buying property can grant residency. Check what your budget unlocks
              and see Dubai areas with qualifying options.
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            {/* Tiers explainer (STEP 5) */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="surface-card p-4 border-accent/30">
                <div className="text-sm font-semibold text-accent">🔵 Investor Visa · 2 years</div>
                <div className="mt-1 text-2xl font-semibold text-fg">AED 750K+</div>
                <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                  <li>• Renewable 2-year residence</li>
                  <li>• Family sponsorship allowed</li>
                  <li>• Property must be retained</li>
                </ul>
              </div>
              <div className="surface-card p-4 border-positive/30">
                <div className="text-sm font-semibold text-positive">🟢 Golden Visa · 10 years</div>
                <div className="mt-1 text-2xl font-semibold text-fg">AED 2M+</div>
                <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                  <li>• 10-year renewable residence</li>
                  <li>• Sponsor family + domestic staff</li>
                  <li>• Mortgaged property can qualify</li>
                </ul>
              </div>
            </section>

            {data && (
              <section className="surface-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-positive" strokeWidth={2.5} />
                  <h2 className="text-sm font-semibold text-fg">How much of the market qualifies</h2>
                </div>
                <p className="mt-2 text-xs text-fg-muted">
                  Across <span className="tabular text-fg">{data.meta.total_residential_sales.toLocaleString()}</span>{' '}
                  Dubai residential sales ({data.meta.window}):
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Stat label="Qualify for investor visa (≥750K)" value={`${data.global.pct_investor_visa}%`} tone="accent" />
                  <Stat label="Qualify for Golden Visa (≥2M)" value={`${data.global.pct_golden_visa}%`} tone="positive" />
                </div>
              </section>
            )}

            {/* Areas with Golden-Visa options */}
            {data && data.areas.length > 0 && (
              <section className="surface-card overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-fg">Areas with Golden-Visa options</h2>
                  <p className="mt-0.5 text-[11px] text-fg-subtle">Share of each area&apos;s residential sales at/above the thresholds.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Area</th>
                        <th className="text-right">Median price</th>
                        <th className="text-right">≥750K</th>
                        <th className="text-right">≥2M</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.areas.slice(0, 20).map((a) => (
                        <tr key={a.name_norm}>
                          <td className="text-fg">{a.name}</td>
                          <td className="num tabular">{formatLargeAED(a.median_price)}</td>
                          <td className="num text-accent">{a.pct_investor_visa}%</td>
                          <td className="num text-positive">{a.pct_golden_visa}%</td>
                          <td className="text-right">
                            <Link href={`/areas/${toAreaSlug(a.name_norm)}`} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                              View <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-lg border border-border bg-bg-elev/30 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                <Info className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2.5} /> Good to know
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-fg-muted">
                <li>• Both visas allow sponsoring immediate family.</li>
                <li>• The qualifying property must be retained to keep the visa.</li>
                <li>• Off-plan and mortgaged properties can count toward the Golden Visa threshold.</li>
                <li className="text-fg-subtle italic">
                  Indicative only — visa rules change. Verify current requirements with DLD / ICP / GDRFA before relying on this.
                </li>
              </ul>
            </section>
          </div>

          {/* Checker (STEP 4) */}
          <aside>
            <div className="sticky top-4 space-y-2">
              <h2 className="text-sm font-semibold text-fg">Check your eligibility</h2>
              {data ? <VisaChecker areas={data.areas} /> : (
                <div className="surface-card p-4 text-xs text-fg-muted">Eligibility data is being prepared.</div>
              )}
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'positive' }) {
  return (
    <div className="rounded-md border border-border bg-bg-elev/30 p-3">
      <div className={`text-2xl tabular font-semibold ${tone === 'positive' ? 'text-positive' : 'text-accent'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
    </div>
  );
}
