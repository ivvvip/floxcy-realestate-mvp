'use client';

import { useMemo, useState } from 'react';
import type { BedroomBenchmarkRow } from '@/lib/types';
import { formatAED, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const BEDROOM_ORDER = [
  'Studio',
  '1BR',
  '2BR',
  '3BR',
  '4BR',
  '5BR+',
  'Penthouse',
];

interface Props {
  areaName: string;
  rows: BedroomBenchmarkRow[];
  avgAnnualRent: number | null;
  marketYieldPct: number | null;
}

/**
 * "What can you buy here?" — bedroom-level sale benchmarks with a
 * Buy Prices ↔ Implied Rental Income toggle. Rental income is derived
 * by multiplying the bedroom's median sale price by the area-level
 * yield, since DLD rent contracts aren't split by bedroom in the same
 * benchmarks table.
 */
export function AreaBedroomBreakdown({
  rows,
  avgAnnualRent,
  marketYieldPct,
}: Props) {
  const [mode, setMode] = useState<'buy' | 'rent'>('buy');

  // Aggregate ALL years/reg_types per bedroom — pick the latest year row
  // with the highest sample (favors 'ready' over 'off_plan' on ties).
  const aggregated = useMemo(() => {
    const byBed = new Map<string, BedroomBenchmarkRow>();
    for (const r of rows) {
      const existing = byBed.get(r.bedroom_type);
      if (
        !existing ||
        r.year > existing.year ||
        (r.year === existing.year &&
          r.transaction_count > existing.transaction_count)
      ) {
        byBed.set(r.bedroom_type, r);
      }
    }
    const result: BedroomBenchmarkRow[] = [];
    for (const bt of BEDROOM_ORDER) {
      const row = byBed.get(bt);
      if (row) result.push(row);
    }
    // Append unknown bedroom types at the end
    for (const [bt, row] of byBed.entries()) {
      if (!BEDROOM_ORDER.includes(bt)) result.push(row);
    }
    return result;
  }, [rows]);

  const totalTx = aggregated.reduce((s, r) => s + r.transaction_count, 0);
  const mostPopularBed = aggregated.reduce<BedroomBenchmarkRow | null>(
    (best, r) => (best == null || r.transaction_count > best.transaction_count ? r : best),
    null,
  );

  if (aggregated.length === 0) return null;

  return (
    <section
      id="bedroom-breakdown"
      className="card overflow-hidden scroll-mt-28"
    >
      <div className="border-b border-border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg tracking-tight">
            What can you buy here?
          </h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Per-bedroom benchmarks · {totalTx.toLocaleString()} DLD transactions
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Bedroom view"
          className="inline-flex rounded-md border border-border bg-bg-elev/40 p-0.5 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'buy'}
            onClick={() => setMode('buy')}
            className={cn(
              'px-3 py-1 rounded-[5px] transition-colors',
              mode === 'buy'
                ? 'bg-accent text-accent-fg font-medium'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            Buy prices
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'rent'}
            onClick={() => setMode('rent')}
            className={cn(
              'px-3 py-1 rounded-[5px] transition-colors',
              mode === 'rent'
                ? 'bg-accent text-accent-fg font-medium'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            Rental income
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-fg-subtle">
            <tr className="border-b border-border">
              <th className="text-left py-2.5 px-4 font-medium uppercase tracking-wide text-[10px]">
                Bedroom
              </th>
              <th className="text-right py-2.5 px-4 font-medium uppercase tracking-wide text-[10px]">
                {mode === 'buy' ? 'Avg price' : 'Annual rent (est.)'}
              </th>
              <th className="text-right py-2.5 px-4 font-medium uppercase tracking-wide text-[10px] hidden sm:table-cell">
                {mode === 'buy' ? 'Median' : 'Monthly (est.)'}
              </th>
              <th className="text-right py-2.5 px-4 font-medium uppercase tracking-wide text-[10px]">
                Sales
              </th>
              <th className="text-right py-2.5 px-4 font-medium uppercase tracking-wide text-[10px] hidden md:table-cell">
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {aggregated.map((r) => {
              const isTop =
                mostPopularBed != null &&
                r.bedroom_type === mostPopularBed.bedroom_type;
              const avgPrice = r.avg_price_aed;
              const medPrice = r.median_price_aed;
              const annualRent =
                mode === 'rent' && marketYieldPct != null && avgPrice != null
                  ? avgPrice * (marketYieldPct / 100)
                  : null;
              const medAnnualRent =
                mode === 'rent' && marketYieldPct != null && medPrice != null
                  ? medPrice * (marketYieldPct / 100)
                  : null;
              return (
                <tr
                  key={r.bedroom_type}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2.5 px-4 font-medium text-fg">
                    <span className="inline-flex items-center gap-1.5">
                      {r.bedroom_type}
                      {isTop && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-accent/15 text-accent">
                          Most popular
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-right py-2.5 px-4 font-mono tabular text-fg">
                    {mode === 'buy'
                      ? avgPrice != null
                        ? formatAED(avgPrice, { compact: true })
                        : '—'
                      : annualRent != null
                        ? formatAED(annualRent, { compact: true })
                        : '—'}
                  </td>
                  <td className="text-right py-2.5 px-4 font-mono tabular text-fg-muted hidden sm:table-cell">
                    {mode === 'buy'
                      ? medPrice != null
                        ? formatAED(medPrice, { compact: true })
                        : '—'
                      : medAnnualRent != null
                        ? `AED ${formatNumber(medAnnualRent / 12, 0)}`
                        : '—'}
                  </td>
                  <td className="text-right py-2.5 px-4 font-mono tabular text-fg-muted">
                    {r.transaction_count.toLocaleString()}
                  </td>
                  <td className="text-right py-2.5 px-4 font-mono tabular text-fg-subtle hidden md:table-cell">
                    {r.year}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 text-[10px] text-fg-subtle border-t border-border">
        {mode === 'rent' ? (
          <>
            Rental income is derived from each bedroom&apos;s sale price × the
            area-level yield
            {marketYieldPct != null ? ` (${marketYieldPct.toFixed(2)}%)` : ''}.
            DLD doesn&apos;t publish rent contracts split by bedroom; the area
            yield is the closest reliable proxy.
            {avgAnnualRent != null && (
              <>
                {' '}Area avg annual rent across all bedrooms:{' '}
                <span className="font-mono text-fg-muted">
                  {formatAED(avgAnnualRent, { compact: true })}
                </span>
                .
              </>
            )}
          </>
        ) : (
          <>
            Source: DLD bedroom benchmarks. Sale prices are averaged at the
            (bedroom, year) level across registered transactions.
          </>
        )}
      </div>
    </section>
  );
}
