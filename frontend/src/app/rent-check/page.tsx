import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDldStats, getDldAreas, getCanonicalAreas } from '@/lib/api';
import { RentCheckClient } from './RentCheckClient';
import { RentMarketTable } from './RentMarketTable';
import { CheckCircle2, ExternalLink, FileText, Building2 } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Is Your Rent Fair? — DLD Benchmark',
  description:
    'Check your Dubai rent against Dubai Land Department market benchmarks. Pick your area, choose your size, enter your rent — get a fair/above/below verdict in one tap.',
};

export const revalidate = 3600;

export default async function RentCheckPage() {
  // Canonical is the authoritative area list (284 entries, low-noise
  // filtered at >=5 occurrences = 258). We still pull /dld/areas for the
  // rent_count + median_annual_rent hint shown next to each name in the
  // dropdown — canonical doesn't carry rent metrics.
  const [stats, areas, canon] = await Promise.all([
    getDldStats().catch(() => null),
    getDldAreas({ limit: 500 }).catch(() => null),
    getCanonicalAreas({ min_occurrences: 0 }).catch(() => null),
  ]);

  // Canonical is the spine: ALL 284 areas in the dropdown, even ones with
  // no rent data yet (they'll just show 0 contracts). We overlay
  // dld_areas data (rent_count + median_annual_rent) where available so
  // the rent-check suggestion sidebar can still rank by rent activity.
  // The dropdown itself sorts A-Z and shows data-state per area via the
  // shared AreaSelector.
  const dldByUpper = new Map(
    (areas?.items ?? []).map((a) => [
      a.name.toUpperCase(),
      { name_norm: a.name_norm, rent_count: a.rent_count_2026, median_annual_rent: a.median_annual_rent },
    ])
  );
  const areaOptions = (canon?.items ?? [])
    .map((c) => {
      const overlay = dldByUpper.get(c.area_name_upper);
      return {
        name: c.area_name,
        name_norm: overlay?.name_norm ?? c.area_name_upper.toLowerCase(),
        rent_count: overlay?.rent_count ?? 0,
        median_annual_rent: overlay?.median_annual_rent ?? 0,
        occurrence_count: c.occurrence_count,
      };
    });

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Rent Fairness Check' }]} />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    Is Your Rent Fair?
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Benchmark against{' '}
                  <span className="font-mono text-fg">
                    {stats?.total_rent_benchmark_cells.toLocaleString() ?? '2,086'}
                  </span>{' '}
                  Dubai Land Department rent cells. Three taps, real numbers, no signup.
                </p>
              </div>
              {stats && (
                <div className="text-left sm:text-right text-[11px] text-fg-subtle">
                  <div>
                    <span className="text-fg-muted">Source:</span>{' '}
                    {stats.data_source}
                  </div>
                  <div>
                    <span className="text-fg-muted">Updated:</span>{' '}
                    {stats.last_updated}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-4 sm:py-6 space-y-6">
          <RentCheckClient areaOptions={areaOptions} />
          {/* Dubai Rent Market — cheapest / most expensive by size */}
          <RentMarketTable />
          {/* Ejari + tenant-rights notice */}
          <TenantRightsNotice />
        </div>
      </Container>
    </div>
  );
}

function TenantRightsNotice() {
  return (
    <section className="border border-border rounded-lg bg-bg-card/60 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
        Your rights as a Dubai tenant
      </h2>
      <div className="grid md:grid-cols-2 gap-3 text-xs text-fg-muted">
        <div className="space-y-1.5">
          <Right>90-day written notice required before any rent change</Right>
          <Right>Max increase capped by RERA Decree 43 (calculator above)</Right>
          <Right>Landlord cannot evict for sale during fixed-term contract</Right>
        </div>
        <div className="space-y-1.5">
          <Right>Ejari registration is mandatory — without it you have no legal recourse</Right>
          <Right>File a dispute at the Rental Disputes Settlement Centre (RDSC)</Right>
          <Right>5% RERA admin fee for any rental dispute filing</Right>
        </div>
      </div>
      <div className="border-t border-border pt-3 grid sm:grid-cols-2 gap-2">
        <a
          href="https://www.dubailand.gov.ae/en/eservices/ejari/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20"
        >
          Register on Ejari
          <ExternalLink className="h-3 w-3" strokeWidth={2} />
        </a>
        <a
          href="https://www.dc.gov.ae/PublicServices/RentalDisputesIntroduction.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-accent/40"
        >
          File a dispute (RDSC)
          <ExternalLink className="h-3 w-3" strokeWidth={2} />
        </a>
      </div>
      <div className="border-t border-border pt-3 text-[11px] text-fg-muted">
        <Link
          href="/buildings"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          <Building2 className="h-3 w-3" strokeWidth={2.5} />
          Check your specific building&apos;s rent benchmark →
        </Link>
      </div>
    </section>
  );
}

function Right({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="h-3 w-3 text-positive shrink-0 mt-0.5" strokeWidth={2.5} />
      <span>{children}</span>
    </div>
  );
}
