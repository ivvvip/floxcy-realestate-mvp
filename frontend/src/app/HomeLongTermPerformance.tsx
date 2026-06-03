/**
 * "Dubai Real Estate — 18 Year Track Record" homepage section.
 *
 * Server component. Fetches /api/v1/dld/areas/top-appreciation with the
 * 10y window + min_years=10 floor and renders 3 podium cards: 10y %
 * gain, AED 1M projected to current value, and 10y CAGR. Renders
 * nothing when fewer than 3 areas have a full 10-year price series
 * (e.g. immediately after a fresh ETL deploy before the appreciation
 * roll-up has landed).
 */
import Link from 'next/link';
import { Trophy, TrendingUp, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { getTopAppreciation } from '@/lib/api';
import { formatAED, formatNumber } from '@/lib/format';
import { toAreaSlug } from '@/lib/slugs';
import { cn } from '@/lib/cn';

const PLACE_ICON = ['🏆', '🥈', '🥉'] as const;
const PLACE_TONE = [
  'text-accent',
  'text-fg',
  'text-fg-muted',
] as const;

export async function HomeLongTermPerformance() {
  const data = await getTopAppreciation(3, 10, '10y').catch(() => null);
  if (!data || data.items.length < 3) return null;

  // Compute the implied base year from each item's 10y window so the
  // "since YYYY" copy isn't hard-coded.
  const baseYear = new Date().getFullYear() - 10;

  return (
    <section className="border-b border-border bg-bg">
      <Container>
        <div className="py-8 sm:py-10">
          <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
                <Trophy className="h-3 w-3 text-accent" strokeWidth={2} />
                Long-term performance · 18 years of DLD records
              </div>
              <h2 className="mt-1 text-xl font-semibold text-fg tracking-tight">
                Dubai Real Estate — 18-Year Track Record
              </h2>
              <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                Top {data.items.length} areas by 10-year cumulative price
                growth — picks up the post-GFC base (2009 floor) and runs
                through the 2014 peak, 2016 correction, COVID dip, and the
                current cycle. Source: {data.data_source}; min 10-year
                Sales-of-Unit series required to qualify.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
            >
              See full market history
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </div>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
            {data.items.map((it, i) => {
              const ten = it.appreciation_10y_pct;
              const cagr = it.cagr_10y_pct;
              // AED 1M projected: 1,000,000 × (1 + 10y/100). Falls back to
              // CAGR-compounded value when raw 10y is null.
              const projected =
                ten != null
                  ? 1_000_000 * (1 + ten / 100)
                  : cagr != null
                    ? 1_000_000 * Math.pow(1 + cagr / 100, 10)
                    : null;
              const slug = toAreaSlug(it.area_name_norm);
              return (
                <Link
                  key={it.area_name_norm}
                  href={`/areas/${slug}`}
                  className={cn(
                    'rounded-lg border bg-bg-card p-4 hover:bg-bg-elev/40 hover:border-accent/40 transition-colors',
                    i === 0 ? 'border-accent/40' : 'border-border',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-sm font-semibold',
                        PLACE_TONE[i],
                      )}
                    >
                      <span aria-hidden>{PLACE_ICON[i]}</span>
                      {it.area_name_display}
                    </span>
                    <span className="text-[10px] text-fg-subtle tabular">
                      {it.years_of_data}y data
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-semibold text-positive tabular">
                      {ten != null
                        ? `+${ten.toFixed(0)}%`
                        : '—'}
                    </span>
                    <span className="text-[11px] text-fg-muted">
                      since {baseYear}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {projected != null && (
                      <>
                        <span className="text-fg-subtle">AED 1M →</span>
                        <span className="text-fg text-right tabular font-mono">
                          {formatAED(projected, { compact: true })}
                        </span>
                      </>
                    )}
                    {cagr != null && (
                      <>
                        <span className="text-fg-subtle">CAGR</span>
                        <span className="text-positive text-right tabular font-mono">
                          {cagr >= 0 ? '+' : ''}
                          {cagr.toFixed(1)}%/yr
                        </span>
                      </>
                    )}
                    {it.latest_avg_ppsf != null && (
                      <>
                        <span className="text-fg-subtle">Latest PPSF</span>
                        <span className="text-fg text-right tabular font-mono">
                          AED {formatNumber(it.latest_avg_ppsf, 0)}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-accent font-medium">
                    Explore this area
                    <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-3 text-[10px] text-fg-subtle inline-flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" strokeWidth={2} />
            Past performance doesn&apos;t guarantee future returns. Computed
            from registered Sales-of-Unit transactions, not asking prices.
          </p>
        </div>
      </Container>
    </section>
  );
}
