import { Activity, TrendingUp, BarChart3, Layers, Info, History } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getMarketCycle } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { MarketCycle } from '@/lib/types';

export const revalidate = 3600;
export const metadata = {
  title: 'Where is the Dubai Property Market Now? — Cycle Phase | Floxcy',
  description:
    'Is Dubai property overheated? An honest, data-grounded read of the market cycle '
    + 'from 18 years of DLD sales — price trend, volume, supply — interpretation, not prediction.',
};

const PHASES = ['Recovery', 'Growth', 'Peak', 'Correction'];

export default async function CyclePage() {
  let d: MarketCycle | null = null;
  try { d = await getMarketCycle(); } catch { d = null; }

  if (!d) {
    return (
      <div className="bg-bg"><Container><div className="py-16 text-center text-sm text-fg-muted">Cycle data is being prepared.</div></Container></div>
    );
  }

  const s = d.signals;
  const recent = d.by_year.filter((y) => y.year >= 2018);
  const maxYoy = Math.max(...recent.map((y) => Math.abs(y.yoy_price_pct ?? 0)), 1);

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Market Cycle' }]} />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Activity className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">Where is the Dubai Market Now?</h1>
            </div>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              An honest read of the cycle from <span className="text-fg">18 years</span> of DLD sales
              (through {d.meta.complete_through}). Interpretation of signals — <span className="text-fg">not a prediction</span>.
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5 space-y-5">
          {/* Phase + gauge */}
          <section className="surface-card p-5">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle">Current phase (interpreted)</div>
            <div className="mt-1 text-2xl font-semibold text-fg">{d.phase_label}</div>
            <p className="mt-2 text-xs text-fg-muted max-w-2xl">{d.interpretation}</p>

            {/* Gauge: Recovery → Growth → Peak → Correction */}
            <div className="mt-5">
              <div className="relative h-3 rounded-full overflow-hidden flex">
                <div className="flex-1 bg-positive/30" />
                <div className="flex-1 bg-accent/40" />
                <div className="flex-1 bg-warning/40" />
                <div className="flex-1 bg-negative/40" />
              </div>
              {/* marker */}
              <div className="relative h-5" style={{ marginTop: '-2px' }}>
                <div
                  className="absolute -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${Math.min(98, Math.max(2, d.gauge * 100))}%` }}
                >
                  <div className="text-fg text-xs leading-none">▲</div>
                  <div className="text-[9px] text-fg-muted whitespace-nowrap">we are here</div>
                </div>
              </div>
              <div className="mt-1 flex text-[10px] text-fg-subtle">
                {PHASES.map((p) => <div key={p} className="flex-1 text-center">{p}</div>)}
              </div>
            </div>
          </section>

          {/* Signals */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Signal icon={<TrendingUp className="h-3.5 w-3.5" />} label="Prices"
              value={`${s.price.yoy_pct >= 0 ? '+' : ''}${s.price.yoy_pct}% YoY`}
              sub={`${s.price.direction}${s.price.decelerating ? ' but decelerating' : ''} · 5y CAGR ${s.price.cagr_5y_pct}%`}
              tone={s.price.decelerating ? 'warning' : 'positive'} />
            <Signal icon={<BarChart3 className="h-3.5 w-3.5" />} label="Volume"
              value={`${formatNumber(s.volume.latest)} sales`}
              sub={`${s.volume.vs_avg_pct >= 0 ? '+' : ''}${s.volume.vs_avg_pct}% vs 18y avg${s.volume.record_high ? ' · record high' : ''}`}
              tone="positive" />
            <Signal icon={<History className="h-3.5 w-3.5" />} label="vs 2014"
              value={s.vs_history.vs_2014_pct != null ? `+${s.vs_history.vs_2014_pct}%` : '—'}
              sub={s.vs_history.record_high_price ? 'record-high price level' : 'below prior high'}
              tone="neutral" />
            <Signal icon={<Layers className="h-3.5 w-3.5" />} label="Supply (off-plan)"
              value={s.supply.offplan_share_pct != null ? `${s.supply.offplan_share_pct}%` : '—'}
              sub={`off-plan share · ${s.supply.trend} (was ${s.supply.offplan_share_2020_pct}% in 2020)`}
              tone={s.supply.trend === 'rising' ? 'warning' : 'neutral'} />
          </section>

          {/* YoY price deceleration chart — the key signal */}
          <section className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
              <h2 className="text-sm font-semibold text-fg">Price growth by year — still positive, slowing down</h2>
            </div>
            <div className="p-4">
              <div className="flex items-end gap-1.5 sm:gap-2 h-36">
                {recent.map((y) => {
                  const v = y.yoy_price_pct ?? 0;
                  const h = Math.max(3, (Math.abs(v) / maxYoy) * 100);
                  return (
                    <div key={y.year} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <span className="text-[9px] sm:text-[10px] tabular text-fg-muted">{v >= 0 ? '+' : ''}{v}%</span>
                      <div className="w-full h-24 flex items-end">
                        <div className={`w-full rounded-t ${v >= 0 ? 'bg-accent' : 'bg-negative'}`} style={{ height: `${h}%` }}
                          title={`${y.year}: ${y.avg_ppsf} AED/sqft, ${v >= 0 ? '+' : ''}${v}% YoY`} />
                      </div>
                      <span className="text-[9px] sm:text-[10px] tabular text-fg-subtle">{y.year}{y.partial ? '*' : ''}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-fg-subtle">
                Prices are still rising every year, but the <span className="text-fg">rate of increase has slowed</span> for
                several years (+22.5% in 2022 → +5.8% in 2025). *{d.by_year.find((y) => y.partial)?.year} is a partial year.
              </p>
            </div>
          </section>

          {/* Caveats */}
          <section className="rounded-lg border border-border bg-bg-elev/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <Info className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2.5} /> How to read this
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-fg-muted">
              <li>• Cycle phase is an <span className="text-fg">interpretation of market signals, not a prediction</span>. We don&apos;t forecast crashes or booms.</li>
              <li>• We show the underlying signals (price trend, volume, supply) — judge for yourself.</li>
              <li>• Deceleration can mean a soft plateau <span className="text-fg">or</span> a turn — it doesn&apos;t tell us which.</li>
              <li>• Pre-2014 prices are sparse/noisy and excluded from trend and peak claims.</li>
              <li className="text-fg-subtle italic">{d.meta.source}. Do your own research.</li>
            </ul>
          </section>
        </div>
      </Container>
    </div>
  );
}

function Signal({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: 'positive' | 'warning' | 'neutral' }) {
  const c = tone === 'positive' ? 'text-positive' : tone === 'warning' ? 'text-warning' : 'text-fg';
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">{icon}{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular ${c}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-muted">{sub}</div>
    </div>
  );
}
