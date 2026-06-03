/**
 * Price History section — shared by the full /areas/[id] detail page and
 * the LimitedAreaPage (DLD-only areas). Renders the 4-tile appreciation
 * strip (10y if available, otherwise 5y) plus the per-year PPSF line
 * chart. Soft-fails (returns null) when fewer than 2 points are available.
 */
import { Info } from 'lucide-react';
import { MetricTile } from '@/components/data/MetricTile';
import { PriceTrend } from '@/components/charts/PriceTrend';
import type { DldPriceHistoryResponse } from '@/lib/types';

interface Props {
  priceHistory: DldPriceHistoryResponse | null | undefined;
}

export function AreaPriceHistorySection({ priceHistory }: Props) {
  if (!priceHistory || priceHistory.points.length < 2) return null;
  const firstYear = priceHistory.points[0].year;
  const lastYear = priceHistory.points[priceHistory.points.length - 1].year;
  const rangeLabel = `${firstYear}–${lastYear}`;
  const yearsCovered = lastYear - firstYear + 1;
  const has10y = priceHistory.appreciation_10y_pct != null;

  return (
    <section
      id="price-history"
      className="border border-border rounded-lg bg-bg-card overflow-hidden scroll-mt-28"
    >
      <div className="chart-header">
        <span className="chart-header-label inline-flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          {yearsCovered}-Year Price History · {priceHistory.area_name_display} · {rangeLabel}
        </span>
        <span className="text-[11px] text-fg-subtle">
          {priceHistory.years_of_history} years · DLD Sales-of-Unit
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        {has10y ? (
          <MetricTile
            label="10-year growth"
            tooltip="5Y Appreciation"
            value={`${priceHistory.appreciation_10y_pct! >= 0 ? '+' : ''}${priceHistory.appreciation_10y_pct!.toFixed(1)}%`}
            hint={`${lastYear - 10} → ${lastYear}`}
            tone={priceHistory.appreciation_10y_pct! >= 0 ? 'positive' : 'negative'}
            mono
          />
        ) : (
          <MetricTile
            label="5-year growth"
            tooltip="5Y Appreciation"
            value={
              priceHistory.appreciation_5y_pct != null
                ? `${priceHistory.appreciation_5y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_5y_pct.toFixed(1)}%`
                : '—'
            }
            hint={`${lastYear - 5} → ${lastYear}`}
            tone={
              priceHistory.appreciation_5y_pct == null
                ? 'default'
                : priceHistory.appreciation_5y_pct >= 0
                  ? 'positive'
                  : 'negative'
            }
            mono
          />
        )}
        <MetricTile
          label="Annual growth rate"
          value={
            has10y && priceHistory.cagr_10y_pct != null
              ? `${priceHistory.cagr_10y_pct >= 0 ? '+' : ''}${priceHistory.cagr_10y_pct.toFixed(2)}%`
              : priceHistory.cagr_5y_pct != null
                ? `${priceHistory.cagr_5y_pct >= 0 ? '+' : ''}${priceHistory.cagr_5y_pct.toFixed(2)}%`
                : '—'
          }
          hint={has10y && priceHistory.cagr_10y_pct != null ? '10y CAGR' : '5y CAGR'}
          tone={
            (has10y ? priceHistory.cagr_10y_pct : priceHistory.cagr_5y_pct) == null
              ? 'default'
              : (has10y ? priceHistory.cagr_10y_pct! : priceHistory.cagr_5y_pct!) >= 0
                ? 'positive'
                : 'negative'
          }
          mono
        />
        <MetricTile
          label={has10y ? '5-year growth' : '3-year growth'}
          value={
            has10y
              ? priceHistory.appreciation_5y_pct != null
                ? `${priceHistory.appreciation_5y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_5y_pct.toFixed(1)}%`
                : '—'
              : priceHistory.appreciation_3y_pct != null
                ? `${priceHistory.appreciation_3y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_3y_pct.toFixed(1)}%`
                : '—'
          }
          hint={has10y ? `${lastYear - 5} → ${lastYear}` : `${lastYear - 3} → ${lastYear}`}
          mono
        />
        <MetricTile
          label="Last year"
          value={
            priceHistory.appreciation_1y_pct != null
              ? `${priceHistory.appreciation_1y_pct >= 0 ? '+' : ''}${priceHistory.appreciation_1y_pct.toFixed(1)}%`
              : '—'
          }
          hint={`${lastYear - 1} → ${lastYear}`}
          mono
        />
      </div>
      <div className="p-4 sm:p-5">
        <PriceTrend
          data={priceHistory.points.map((p) => ({
            label: String(p.year),
            price:
              (p.avg_ppsf_ready ?? p.avg_ppsf) != null
                ? Math.round(p.avg_ppsf_ready ?? p.avg_ppsf!)
                : undefined,
          }))}
          height={220}
          showYield={false}
        />
        <p className="mt-2 text-[10px] text-fg-subtle">
          Series: average AED/sqft per year, ready stock preferred (off-plan
          launches blended only when no ready trades cleared). Source: DLD
          registered Sales-of-Unit transactions {rangeLabel}.
        </p>
      </div>
    </section>
  );
}
