import { Calendar, TrendingDown, TrendingUp, SearchCheck, Info } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getCityMarketTiming } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { MarketTiming, MarketTimingMonth } from '@/lib/types';

export const revalidate = 3600;
export const metadata = {
  title: 'Dubai Market Timing — Best Time to Buy & Sell | Floxcy',
  description:
    'When is the best time to buy or sell property in Dubai? Statistically verified '
    + 'seasonal patterns from 681,809 DLD sales (2021–2025): February is cheapest, '
    + 'Q4 is peak demand, and the "summer slowdown" is a myth.',
};

export default async function TimingPage() {
  let data: MarketTiming | null = null;
  try {
    data = await getCityMarketTiming();
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div className="bg-bg">
        <Container>
          <div className="py-16 text-center text-sm text-fg-muted">
            Market timing data is being prepared. Check back shortly.
          </div>
        </Container>
      </div>
    );
  }

  const high = new Set(data.demand_high_months);
  const low = new Set(data.demand_low_months);

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Market Timing' }]} />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Calendar className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">Dubai Market Timing</h1>
              <span className="pill pill-accent">Statistically verified</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              Based on <span className="tabular text-fg">{formatNumber(data.meta.total_sales)}</span> DLD
              sales ({data.meta.window}). Demand seasonality is significant in{' '}
              <span className="text-fg">{data.significance.significant_years}</span> years — these are real
              patterns, not noise.
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 space-y-6">

          {/* SECTION 1 — Buyer's Clock vs Seller's Clock */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="surface-card p-4 border-positive/30">
              <div className="flex items-center gap-2 text-positive">
                <TrendingDown className="h-4 w-4" strokeWidth={2.5} />
                <h2 className="text-sm font-semibold">🟢 Best time to BUY</h2>
              </div>
              <div className="mt-2 text-2xl font-semibold text-fg">{data.best_buy.month}</div>
              <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                <li>• ~{data.best_buy.pct_below_avg}% below average price/sqft</li>
                <li>• Lowest competition (quietest demand)</li>
                <li>• Verified {data.best_buy.years_consistent} years</li>
              </ul>
            </div>
            <div className="surface-card p-4 border-negative/30">
              <div className="flex items-center gap-2 text-negative">
                <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
                <h2 className="text-sm font-semibold">🔴 Best time to SELL</h2>
              </div>
              <div className="mt-2 text-2xl font-semibold text-fg">{data.best_sell.months}</div>
              <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                <li>• Peak buyer demand of the year</li>
                <li>• Highest prices of the year</li>
                <li>• Most buyers actively searching</li>
              </ul>
            </div>
          </section>

          {/* SECTION 2 — Demand seasonality curve */}
          <section className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
              <h2 className="text-sm font-semibold text-fg">Demand seasonality — sales by month</h2>
              <span className="ml-auto text-[11px] text-fg-subtle">
                <span className="text-positive">■</span> busy ·{' '}
                <span className="text-fg-muted">■</span> quiet
              </span>
            </div>
            <div className="p-4">
              <DemandChart months={data.months} high={high} low={low} />
              <p className="mt-3 text-[11px] text-fg-subtle">
                Bar height = share of annual sales. Demand index of 1.00 = an average month.
                Busiest: <span className="text-positive">{data.demand_high_months.join(', ')}</span> ·
                quietest: <span className="text-fg">{data.demand_low_months.join(', ')}</span>.
              </p>
            </div>
          </section>

          {/* SECTION 3 — Myth buster */}
          <section className="surface-card p-4 border-warning/30">
            <div className="flex items-center gap-2">
              <SearchCheck className="h-4 w-4 text-warning" strokeWidth={2.5} />
              <h2 className="text-sm font-semibold text-fg">🔍 Myth busted</h2>
            </div>
            <p className="mt-2 text-sm text-fg">
              “Dubai slows down in summer.” <span className="font-semibold text-negative">❌ False.</span>
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Summer (Jun–Aug) is <span className="text-fg tabular">{data.summer.share_pct}%</span> of annual
              sales — at or above the {data.summer.flat_pct}% flat line, and it never dropped below average
              across {data.meta.window}. <span className="text-fg">{data.summer.busiest_summer_month}</span> is
              actually one of the busiest months of the year.
            </p>
            <p className="mt-2 text-[11px] text-fg-subtle italic">
              Source: DLD transactions {data.meta.window} · below-flat in {data.summer.below_flat_years} years.
            </p>
          </section>

          {/* SECTION 4 — Quarterly ramp */}
          <section className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-fg">Quarterly pattern — an ascending ramp</h2>
            </div>
            <div className="p-4 space-y-2">
              {data.quarters.map((q) => (
                <div key={q.q} className="flex items-center gap-3">
                  <span className="w-7 text-xs tabular text-fg-muted">Q{q.q}</span>
                  <div className="flex-1 h-6 rounded bg-bg-elev overflow-hidden">
                    <div
                      className={`h-full rounded ${q.label === 'peak' ? 'bg-positive' : q.label === 'quietest' ? 'bg-fg-subtle' : 'bg-accent'}`}
                      style={{ width: `${(q.pct / 30) * 100}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-xs tabular text-fg">
                    {q.pct}% {q.label && <span className="text-fg-subtle">({q.label})</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Caveats */}
          <section className="rounded-lg border border-border bg-bg-elev/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <Info className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2.5} /> How to read this
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-fg-muted">
              {data.caveats.map((c) => <li key={c}>• {c}</li>)}
            </ul>
            <p className="mt-2 text-[11px] text-fg-subtle italic">
              Method: {data.significance.method} {data.meta.source}.
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
}

function DemandChart({ months, high, low }: { months: MarketTimingMonth[]; high: Set<string>; low: Set<string> }) {
  const maxPct = Math.max(...months.map((m) => m.pct));
  return (
    <div className="flex items-end gap-1.5 h-40">
      {months.map((m) => {
        const h = (m.pct / maxPct) * 100;
        const color = high.has(m.name) ? 'bg-positive' : low.has(m.name) ? 'bg-fg-subtle' : 'bg-accent';
        return (
          <div key={m.m} className="flex-1 flex flex-col items-center justify-end gap-1 group">
            <span className="text-[9px] tabular text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity">
              {m.demand_index.toFixed(2)}
            </span>
            <div className={`w-full rounded-t ${color}`} style={{ height: `${h}%` }} title={`${m.name}: ${formatNumber(m.sales)} sales (${m.pct}%) · demand ${m.demand_index.toFixed(2)}`} />
            <span className="text-[9px] tabular text-fg-muted">{m.name}</span>
          </div>
        );
      })}
    </div>
  );
}
