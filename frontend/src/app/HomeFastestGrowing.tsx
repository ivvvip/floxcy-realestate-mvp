/**
 * "Fastest Growing Areas (5 Years)" homepage widget.
 *
 * Server component — fetches /api/v1/dld/areas/top-appreciation at request
 * time (cached 1h via the API client). Renders a compact leaderboard of
 * 5 areas with their 5-year price appreciation. Honest empty-state if the
 * ETL hasn't run yet or if no area meets the min-years threshold.
 */
import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Container } from '@/components/Container';
import { getTopAppreciation } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

export async function HomeFastestGrowing() {
  const data = await getTopAppreciation(5, 5).catch(() => null);
  if (!data || data.items.length === 0) return null;

  return (
    <section className="border-b border-border bg-bg-card/30">
      <Container>
        <div className="py-7">
          <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1.5">
                <TrendingUp
                  className="h-3 w-3 text-accent"
                  strokeWidth={2}
                />
                Historical price growth · DLD 2021–2026
              </div>
              <h2 className="mt-1 text-lg font-semibold text-fg">
                Fastest Growing Areas — last 5 years
              </h2>
              <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                Top {data.count} Dubai areas by registered Sales-of-Unit
                appreciation between 2021 and 2026. Computed from{' '}
                {data.data_source}; areas need a full 5-year series to qualify.
              </p>
            </div>
            <Link
              href="/areas?sort_by=name"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-3 text-xs font-medium text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
            >
              Browse all areas
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </div>

          <ol className="border border-border rounded-lg overflow-hidden bg-bg-card divide-y divide-border/60">
            {data.items.map((it, i) => {
              const sign = it.appreciation_5y_pct >= 0 ? '+' : '';
              const oneYearTone =
                it.appreciation_1y_pct == null
                  ? 'text-fg-subtle'
                  : it.appreciation_1y_pct >= 0
                    ? 'text-positive'
                    : 'text-negative';
              return (
                <li key={it.area_name_norm}>
                  <Link
                    href={`/areas/${encodeURIComponent(it.area_name_norm.replace(/ /g, '-'))}`}
                    className="grid grid-cols-[28px_1fr_auto_auto] sm:grid-cols-[28px_1fr_120px_140px_120px] items-center gap-3 px-4 py-3 text-sm hover:bg-bg-elev/40"
                  >
                    <span className="text-fg-subtle tabular text-right font-mono">
                      #{i + 1}
                    </span>
                    <span className="text-fg font-medium truncate">
                      {it.area_name_display}
                      <span className="ml-2 text-[10px] text-fg-subtle">
                        {it.years_of_data}y data
                      </span>
                    </span>
                    {it.latest_avg_ppsf != null && (
                      <span className="hidden sm:inline text-[11px] text-fg-muted tabular font-mono">
                        AED {formatNumber(it.latest_avg_ppsf, 0)}/sqft
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded bg-positive/15 px-2 py-0.5 text-[12px] font-mono text-positive whitespace-nowrap text-center',
                      )}
                    >
                      {sign}
                      {it.appreciation_5y_pct.toFixed(1)}% 5y
                    </span>
                    <span className="hidden sm:flex items-center justify-end gap-2 text-[11px] font-mono">
                      {it.cagr_5y_pct != null && (
                        <span className="text-fg-muted">
                          CAGR {it.cagr_5y_pct.toFixed(1)}%
                        </span>
                      )}
                      {it.appreciation_1y_pct != null && (
                        <span className={oneYearTone}>
                          {it.appreciation_1y_pct >= 0 ? '+' : ''}
                          {it.appreciation_1y_pct.toFixed(1)}% 1y
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>

          <p className="mt-3 text-[10px] text-fg-subtle">
            Source: {data.data_source} · Updated {data.last_updated}.
            Appreciation = (latest year avg PPSF − base year avg PPSF) ÷ base
            year × 100, computed on the all-units blended series.
          </p>
        </div>
      </Container>
    </section>
  );
}
