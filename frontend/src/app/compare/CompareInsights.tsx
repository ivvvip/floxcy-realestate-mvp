'use client';

import { useMemo } from 'react';
import { Crown, Sparkles, Calculator, Share2, Check } from 'lucide-react';
import { formatAED, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { CompareAreaData } from '@/lib/types';

interface Props {
  areas: CompareAreaData[];
}

/**
 * Three insight blocks rendered above the existing comparison tabs:
 *   1. Winner-tagged metrics table (🏆 best per row)
 *   2. AED 1M simulator (units / income / 5y projection per area)
 *   3. Plain-English AI verdict (per-strategy winner)
 *   4. Share button — copies the current URL
 */
export function CompareInsights({ areas }: Props) {
  const metrics = useMemo(() => deriveMetrics(areas), [areas]);

  if (areas.length < 2) return null;

  return (
    <div className="space-y-5">
      <WinnerTable areas={areas} metrics={metrics} />
      <SimulatorPanel areas={areas} />
      <VerdictPanel areas={areas} metrics={metrics} />
      <ShareRow />
    </div>
  );
}

// ===========================================================================
// 1. Winner-tagged metrics table
// ===========================================================================

interface Metric {
  key: string;
  label: string;
  /** higher is better unless invert=true */
  invert?: boolean;
  format: (v: number) => string;
  getter: (a: CompareAreaData) => number | null;
}

function deriveMetrics(areas: CompareAreaData[]): Metric[] {
  return [
    {
      key: 'price',
      label: 'Avg AED/sqft',
      invert: true,  // lower is better
      format: (v) => formatNumber(v, 0),
      getter: (a) => a.dld?.median_price_per_sqft ?? a.latest_price_per_sqft,
    },
    {
      key: 'yield',
      label: 'Gross yield %',
      format: (v) => `${v.toFixed(2)}%`,
      getter: (a) => a.dld?.rental_yield_pct ?? a.latest_yield,
    },
    {
      key: 'rentyoy',
      label: 'Rent growth YoY',
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
      getter: (a) => a.dld?.rent_growth_yoy_pct ?? null,
    },
    {
      key: 'appr3y',
      label: '3y appreciation',
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
      getter: (a) => a.appreciation_3y,
    },
    {
      key: 'occupancy',
      label: 'Occupancy',
      format: (v) => `${v.toFixed(0)}%`,
      getter: (a) => a.occupancy_rate,
    },
    {
      key: 'investment',
      label: 'Investment score',
      format: (v) => `${v.toFixed(1)}/10`,
      getter: (a) => a.investment_score,
    },
    {
      key: 'risk',
      label: 'Risk score',
      invert: true,
      format: (v) => `${v.toFixed(1)}/10`,
      getter: (a) => a.risk_score,
    },
  ];
}

function WinnerTable({ areas, metrics }: { areas: CompareAreaData[]; metrics: Metric[] }) {
  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-warning" strokeWidth={2.5} />
          Head-to-head — winner per metric
        </h2>
        <span className="text-[10px] text-fg-subtle">🏆 highlights the leader on each row</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="text-left">Metric</th>
              {areas.map((a) => (
                <th key={a.id} className="text-right">{a.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const values = areas.map((a) => m.getter(a));
              const valid = values.filter((v): v is number => v != null);
              const winnerIdx = valid.length
                ? findWinnerIdx(values, m.invert ?? false)
                : -1;
              return (
                <tr key={m.key}>
                  <td className="text-fg-muted">{m.label}</td>
                  {values.map((v, i) => (
                    <td key={i} className="num">
                      {v == null ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        <span
                          className={cn(
                            'tabular inline-flex items-center gap-1 justify-end',
                            i === winnerIdx ? 'font-semibold text-positive' : 'text-fg'
                          )}
                        >
                          {i === winnerIdx && <span>🏆</span>}
                          {m.format(v)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function findWinnerIdx(values: (number | null)[], invert: boolean): number {
  let bestIdx = -1;
  let best: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (best == null) {
      best = v;
      bestIdx = i;
      continue;
    }
    const wins = invert ? v < best : v > best;
    if (wins) {
      best = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ===========================================================================
// 2. AED 1M simulator
// ===========================================================================

const SIM_BUDGET = 1_000_000;

function SimulatorPanel({ areas }: { areas: CompareAreaData[] }) {
  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          If you invested {formatAED(SIM_BUDGET, { compact: true })} — 5y outlook
        </h2>
        <p className="mt-0.5 text-[11px] text-fg-muted">
          Approximates units affordable (using 75 sqm 1BR), annual gross
          rental income, and 5y projected value using the area&apos;s historical
          CAGR. Heuristic; not investment advice.
        </p>
      </div>
      <div className="p-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {areas.map((a) => {
          const sim = simulate(a);
          return (
            <div key={a.id} className="border border-border rounded-md bg-bg-elev/20 p-3">
              <div className="text-xs font-semibold text-fg mb-2 truncate">{a.name}</div>
              {sim ? (
                <div className="space-y-1.5 text-[11px]">
                  <Row label="Units (1BR ~75sqm)" value={sim.units.toFixed(1)} />
                  <Row label="Annual gross rent" value={formatAED(sim.annual_rent, { compact: true })} accent />
                  <Row label="5y projected value" value={formatAED(sim.projected_5y, { compact: true })} accent />
                  <Row
                    label="Total 5y return"
                    value={`${sim.total_5y_pct >= 0 ? '+' : ''}${sim.total_5y_pct.toFixed(0)}%`}
                    tone={sim.total_5y_pct >= 30 ? 'positive' : 'neutral'}
                  />
                  <Row
                    label="Break-even (rent only)"
                    value={sim.breakeven_years != null ? `${sim.breakeven_years.toFixed(0)}y` : '—'}
                  />
                </div>
              ) : (
                <p className="text-[11px] text-fg-subtle italic">Insufficient DLD data to simulate</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function simulate(a: CompareAreaData) {
  const ppsf = a.dld?.median_price_per_sqft ?? a.latest_price_per_sqft;
  const yieldPct = a.dld?.rental_yield_pct ?? a.latest_yield;
  if (!ppsf || ppsf <= 0 || !yieldPct || yieldPct <= 0) return null;
  // 75 sqm = 807 sqft
  const unitPrice = ppsf * 807;
  const units = SIM_BUDGET / unitPrice;
  const annual_rent = SIM_BUDGET * (yieldPct / 100);
  // Use 3y appreciation as a proxy CAGR (annualised)
  const appr3y = a.appreciation_3y;
  const cagr = appr3y != null ? Math.pow(1 + appr3y / 100, 1 / 3) - 1 : 0.08;
  const projected_5y = SIM_BUDGET * Math.pow(1 + cagr, 5);
  const total_5y_return_aed = (projected_5y - SIM_BUDGET) + (annual_rent * 5);
  const total_5y_pct = (total_5y_return_aed / SIM_BUDGET) * 100;
  const breakeven_years = annual_rent > 0 ? SIM_BUDGET / annual_rent : null;
  return { units, annual_rent, projected_5y, total_5y_pct, breakeven_years };
}

function Row({
  label, value, accent, tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const c =
    tone === 'positive' ? 'text-positive' :
    tone === 'negative' ? 'text-negative' :
    accent ? 'text-accent' : 'text-fg';
  return (
    <div className="flex justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className={cn('tabular font-medium', c)}>{value}</span>
    </div>
  );
}

// ===========================================================================
// 3. AI verdict
// ===========================================================================

function VerdictPanel({ areas, metrics }: { areas: CompareAreaData[]; metrics: Metric[] }) {
  // Find per-strategy winners
  const yieldM = metrics.find((m) => m.key === 'yield')!;
  const apprM = metrics.find((m) => m.key === 'appr3y')!;
  const priceM = metrics.find((m) => m.key === 'price')!;

  const yieldWinner = findWinner(areas, yieldM);
  const apprWinner = findWinner(areas, apprM);
  const priceWinner = findWinner(areas, priceM);

  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          AI verdict
        </h2>
      </div>
      <div className="p-4 space-y-2 text-xs">
        {yieldWinner && (
          <Verdict
            tag="Income"
            line={`${yieldWinner.area.name} wins on yield — ${yieldM.format(yieldWinner.value)}${
              yieldWinner.delta != null ? ` (+${yieldM.format(yieldWinner.delta).replace(/^[+-]?/, '')} vs runner-up)` : ''
            }`}
          />
        )}
        {apprWinner && (
          <Verdict
            tag="Growth"
            line={`${apprWinner.area.name} leads 3y appreciation at ${apprM.format(apprWinner.value)}${
              apprWinner.delta != null ? ` (+${apprWinner.delta.toFixed(1)}pp vs runner-up)` : ''
            }`}
          />
        )}
        {priceWinner && (
          <Verdict
            tag="Value"
            line={`${priceWinner.area.name} cheapest at ${priceM.format(priceWinner.value)} AED/sqft${
              priceWinner.delta != null ? ` (${formatNumber(priceWinner.delta, 0)} AED/sqft below runner-up)` : ''
            }`}
          />
        )}
        {!yieldWinner && !apprWinner && !priceWinner && (
          <p className="text-fg-subtle italic">Insufficient data to call a winner — try adding areas with full DLD coverage.</p>
        )}
      </div>
    </section>
  );
}

function findWinner(areas: CompareAreaData[], m: Metric) {
  const values = areas.map((a) => m.getter(a));
  const winnerIdx = findWinnerIdx(values, m.invert ?? false);
  if (winnerIdx < 0) return null;
  const winnerValue = values[winnerIdx]!;
  // Compute delta vs runner-up (best non-winner)
  let runnerUp: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i === winnerIdx || values[i] == null) continue;
    if (runnerUp == null) {
      runnerUp = values[i]!;
      continue;
    }
    const wins = m.invert ? values[i]! < runnerUp : values[i]! > runnerUp;
    if (wins) runnerUp = values[i]!;
  }
  const delta = runnerUp != null ? Math.abs(winnerValue - runnerUp) : null;
  return { area: areas[winnerIdx], value: winnerValue, delta };
}

function Verdict({ tag, line }: { tag: string; line: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="pill pill-accent text-[10px] tabular shrink-0 mt-0.5 w-14 text-center">{tag}</span>
      <span className="text-fg leading-relaxed">{line}</span>
    </div>
  );
}

// ===========================================================================
// 4. Share row
// ===========================================================================

function ShareRow() {
  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      // Tiny inline confirmation
      const el = document.getElementById('compare-share-confirm');
      if (el) {
        el.classList.remove('opacity-0');
        setTimeout(() => el.classList.add('opacity-0'), 1500);
      }
    } catch {
      // Fallback — open share sheet if available
      if ('share' in navigator) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> })
          .share({ title: 'Floxcy comparison', url });
      }
    }
  };
  return (
    <div className="flex items-center justify-end gap-3 px-2">
      <span
        id="compare-share-confirm"
        className="text-[11px] text-positive opacity-0 transition-opacity inline-flex items-center gap-1"
      >
        <Check className="h-3 w-3" strokeWidth={2.5} />
        Link copied
      </span>
      <button
        type="button"
        onClick={onShare}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-card px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-accent/40"
      >
        <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
        Copy shareable link
      </button>
    </div>
  );
}

// Suppress unused
void formatPercent;
