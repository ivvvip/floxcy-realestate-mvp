import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Users, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDldStats, getDldAreas, getTopCompanies } from '@/lib/api';
import { BrokersDirectoryClient } from './BrokersDirectoryClient';

export const metadata: Metadata = {
  title: 'RERA Broker Directory — DLD-verified Dubai brokers',
  description:
    "Search every active RERA-licensed broker in Dubai, take the smart-match wizard to find one who fits your goal/area/language/budget, or browse the largest firms. All sourced from Dubai Land Department open data.",
};

export const revalidate = 3600;

export default async function BrokersDirectoryPage() {
  const [stats, areas, top] = await Promise.all([
    getDldStats().catch(() => null),
    getDldAreas({ min_rents: 20, limit: 500 }).catch(() => null),
    getTopCompanies(10).catch(() => null),
  ]);

  const areaOptions = (areas?.items ?? [])
    .map((a) => ({
      name: a.name,
      name_norm: a.name_norm,
      rent_count: a.rent_count_2026,
    }))
    .sort((a, b) => b.rent_count - a.rent_count);

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'RERA Broker Directory' }]} />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    RERA Broker Directory
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Verified against the official Dubai Land Department broker
                  registry. Take the 4-tap wizard, browse, or filter.
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

      {/* SECTION 1 — Stats bar */}
      {stats && (
        <div className="border-b border-border bg-bg-card/30">
          <Container>
            <div className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
              <span>
                <span className="font-mono text-fg">
                  {stats.total_active_brokers.toLocaleString()}
                </span>{' '}
                Active RERA Brokers
              </span>
              <span className="text-fg-subtle">·</span>
              <span>
                Source:{' '}
                <Link
                  href="/data-sources"
                  className="text-accent hover:underline"
                >
                  Dubai Land Department
                </Link>
              </span>
              <span className="text-fg-subtle">·</span>
              <span>Updated {stats.last_updated}</span>
            </div>
          </Container>
        </div>
      )}

      <Container>
        <div className="py-4 sm:py-6">
          <BrokersDirectoryClient
            areaOptions={areaOptions}
            topCompanies={top?.items ?? []}
            stats={stats}
          />
        </div>
      </Container>

      {/* SECTION 8 — Join CTA banner */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-bg-card/95 backdrop-blur-md">
        <Container>
          <div className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-accent" strokeWidth={2} />
              <span className="text-fg font-medium">
                Are you a RERA-licensed broker?
              </span>
              <span className="hidden sm:inline text-fg-muted">
                Get qualified investor leads from Floxcy.
              </span>
            </div>
            <Link
              href="/brokers/apply"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg hover:bg-accent/90"
            >
              Join as Verified Broker
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </Link>
          </div>
        </Container>
      </div>
    </div>
  );
}
