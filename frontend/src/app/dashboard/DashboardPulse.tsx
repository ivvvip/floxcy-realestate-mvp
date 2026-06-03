import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Scale,
  Calculator,
  Building2,
  Users,
  GitCompare,
  Sparkles,
  Database,
  Clock,
} from 'lucide-react';
import type { DashboardPulseResponse } from '@/lib/types';
import { formatAEDFull, formatLargeAED, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { YieldVsAppreciationMatrix } from './YieldAppreciationMatrix';
import { MetricTooltip } from '@/components/MetricTooltip';
import { toAreaSlug } from '@/lib/slugs';

/**
 * The 7 dashboard widgets in one block, fed by /api/v1/dld/dashboard-pulse.
 *
 *   1 Market sentiment composite
 *   2 Yield × 5y appreciation 4-quadrant scatter
 *   3 Rent vs buy payback gauge
 *   4 Hot areas (YoY transaction growth)
 *   5 Off-plan pipeline
 *   6 Quick actions bar
 *   7 Data freshness card
 */
export function DashboardPulse({ pulse }: { pulse: DashboardPulseResponse | null }) {
  if (!pulse) {
    return (
      <section className="card p-4 text-xs text-fg-subtle">
        Dashboard pulse is briefly unavailable. Refresh in a moment.
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <MarketOverviewCard pulse={pulse} />
      <div className="grid gap-4 lg:grid-cols-2">
        <YieldVsAppreciationMatrix pulse={pulse} />
        <RentVsBuyCard pulse={pulse} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <HotAreasCard pulse={pulse} />
        <OffplanPipelineCard pulse={pulse} />
      </div>
      <QuickActionsBar />
      <DataFreshnessCard pulse={pulse} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Market overview — neutral facts only. No BULLISH/BEARISH labels, no
// red tones, no aggregate verdict. Investors read the numbers and decide.
// ---------------------------------------------------------------------------

function MarketOverviewCard({ pulse }: { pulse: DashboardPulseResponse }) {
  const ov = pulse.market_overview;
  return (
    <section className="rounded-lg border border-border bg-bg-card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
          {ov.period_label}
        </div>
        <div className="text-[11px] text-fg-subtle">
          Source: {ov.source}
        </div>
      </div>
      <div className="mt-3 border-t border-border" />
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ov.metrics.map((m) => (
          <div key={m.name} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wide text-fg-subtle truncate">
              {m.name}
            </dt>
            <dd className="mt-1 text-lg sm:text-xl font-mono tabular text-fg">
              {m.value}
            </dd>
            {m.period && (
              <div className="mt-0.5 text-[10px] text-fg-subtle truncate">
                {m.period}
              </div>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. Yield × 5y appreciation 4-quadrant scatter — see YieldAppreciationMatrix.tsx
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. Rent vs Buy gauge
// ---------------------------------------------------------------------------

function RentVsBuyCard({ pulse }: { pulse: DashboardPulseResponse }) {
  const g = pulse.rent_vs_buy;
  if (!g) {
    return (
      <section className="card p-4">
        <h3 className="text-sm font-semibold text-fg">Rent vs buy</h3>
        <p className="mt-2 text-xs text-fg-subtle">
          Not enough area-level sales + rent coverage yet to compute a payback.
        </p>
      </section>
    );
  }
  const signalText =
    g.signal === 'buy' ? '🟢 BUY' : g.signal === 'rent' ? '🟡 RENT' : '⚪ NEUTRAL';
  const pct = Math.min(100, Math.max(0, (g.payback_years / 30) * 100));
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-fg inline-flex items-center">
        Dubai rent-vs-buy index
        <MetricTooltip metric="Payback Period" />
      </h3>
      <p className="mt-0.5 text-[11px] text-fg-subtle">
        Weighted across {g.based_on_areas} covered areas
      </p>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-fg tabular">
          {g.payback_years.toFixed(1)}
        </span>
        <span className="text-fg-muted">years payback</span>
      </div>
      <div className="mt-3 h-3 rounded-full bg-bg-elev overflow-hidden border border-border">
        <div
          className={cn(
            'h-full',
            g.signal === 'buy' && 'bg-positive',
            g.signal === 'neutral' && 'bg-fg-muted',
            g.signal === 'rent' && 'bg-warning',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-fg-subtle tabular">
        <span>0y · Buy</span>
        <span>15y</span>
        <span>25y · Rent</span>
        <span>30y+</span>
      </div>
      <div className="mt-3 text-xs">
        Signal:{' '}
        <span
          className={cn(
            'font-semibold',
            g.signal === 'buy' && 'text-positive',
            g.signal === 'rent' && 'text-warning',
            g.signal === 'neutral' && 'text-fg',
          )}
        >
          {signalText}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-fg-subtle leading-relaxed">
        Avg sale price{' '}
        <span className="font-mono text-fg" title={formatAEDFull(g.avg_sale_price_aed)}>
          {formatLargeAED(g.avg_sale_price_aed)}
        </span>
        {' '}÷ avg annual rent{' '}
        <span className="font-mono text-fg" title={formatAEDFull(g.avg_annual_rent_aed)}>
          {formatLargeAED(g.avg_annual_rent_aed)}
        </span>
        . &lt;15y = buy-friendly, &gt;25y = rent-friendly.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Hot areas (YoY transaction growth)
// ---------------------------------------------------------------------------

function HotAreasCard({ pulse }: { pulse: DashboardPulseResponse }) {
  const hot = pulse.hot_areas;
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
        Hot areas — transaction volume YoY
        <MetricTooltip metric="Transaction Volume" />
      </h3>
      <p className="mt-0.5 text-[11px] text-fg-subtle">
        Latest year vs prior, areas with ≥50 prior-year sales.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {hot.length === 0 && (
          <li className="py-6 text-center text-xs text-fg-subtle">
            No areas met the threshold for a hot/cold signal.
          </li>
        )}
        {hot.slice(0, 6).map((h) => {
          const Icon =
            h.trend === 'up' ? TrendingUp : h.trend === 'down' ? TrendingDown : Minus;
          return (
            <li key={h.area_name_norm} className="py-2 flex items-center gap-3">
              <Link
                href={`/areas/${toAreaSlug(h.area_name_norm)}`}
                className="flex-1 min-w-0 text-fg font-medium truncate hover:text-accent"
              >
                {h.area_name_display}
              </Link>
              <span className="text-[11px] text-fg-subtle tabular">
                {formatNumber(h.txn_count_latest)} vs {formatNumber(h.txn_count_prior)}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-sm font-mono tabular w-20 justify-end',
                  h.trend === 'up' && 'text-positive',
                  h.trend === 'down' && 'text-negative',
                  h.trend === 'flat' && 'text-fg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {h.pct_change_yoy >= 0 ? '+' : ''}{h.pct_change_yoy.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. Off-plan pipeline
// ---------------------------------------------------------------------------

function OffplanPipelineCard({ pulse }: { pulse: DashboardPulseResponse }) {
  const op = pulse.offplan;
  if (!op || op.top_areas.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="text-sm font-semibold text-fg">Off-plan pipeline</h3>
        <p className="mt-2 text-xs text-fg-subtle">
          No off-plan sales recorded in the latest year window.
        </p>
      </section>
    );
  }
  const maxVol = Math.max(...op.top_areas.map((a) => a.offplan_volume_aed));
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
        Off-plan pipeline
        <MetricTooltip metric="Off-Plan %" />
      </h3>
      <p className="mt-0.5 text-[11px] text-fg-subtle">
        Estimated volume from {formatNumber(op.total_offplan_count)} off-plan
        sales · expected completions through 2027.
      </p>
      <div className="mt-3 text-2xl font-semibold text-fg tabular"
           title={formatAEDFull(op.total_offplan_volume_aed)}>
        {formatLargeAED(op.total_offplan_volume_aed)}
      </div>
      <div className="mt-1 text-[11px] text-fg-subtle">Total under construction (est.)</div>
      <ul className="mt-3 space-y-2">
        {op.top_areas.map((a) => {
          const pct = (a.offplan_volume_aed / maxVol) * 100;
          return (
            <li key={a.area_name_norm}>
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/areas/${toAreaSlug(a.area_name_norm)}`}
                  className="text-xs text-fg font-medium truncate hover:text-accent"
                >
                  {a.area_name_display}
                </Link>
                <span className="text-[11px] text-fg-muted tabular shrink-0"
                      title={formatAEDFull(a.offplan_volume_aed)}>
                  {formatLargeAED(a.offplan_volume_aed)} · {a.offplan_share_pct.toFixed(0)}% off-plan
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-bg-elev overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. Quick actions bar
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { href: '/rent-check',       label: 'Is My Rent Fair?', icon: Scale       },
  { href: '/roi-calculator',   label: 'Calculate ROI',    icon: Calculator  },
  { href: '/buildings',        label: 'Building X-Ray',   icon: Building2   },
  { href: '/brokers/directory', label: 'Find Broker',      icon: Users       },
  { href: '/compare',          label: 'Compare Areas',    icon: GitCompare  },
  { href: '/opportunities',    label: 'Top Yields',       icon: Sparkles    },
] as const;

function QuickActionsBar() {
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-fg">Quick actions</h3>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-bg-card px-3 py-3 text-xs font-medium text-fg hover:border-accent/40 hover:bg-accent/5 transition-colors min-h-[64px]"
          >
            <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
            <span className="text-center">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 7. Data freshness card
// ---------------------------------------------------------------------------

function DataFreshnessCard({ pulse }: { pulse: DashboardPulseResponse }) {
  const f = pulse.freshness;
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
        Data freshness
      </h3>
      <p className="mt-0.5 text-[11px] text-fg-subtle inline-flex items-center gap-1.5">
        <Clock className="h-3 w-3" strokeWidth={2} />
        All data current as of {f.snapshot_date}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Transactions</dt>
          <dd className="mt-0.5 font-mono text-fg">{f.transactions_year_range}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Rents</dt>
          <dd className="mt-0.5 font-mono text-fg">{f.rents_year_range}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">DLD snapshot</dt>
          <dd className="mt-0.5 font-mono text-fg">{f.snapshot_date}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Last ETL run</dt>
          <dd className="mt-0.5 font-mono text-fg">{f.last_etl_run}</dd>
        </div>
      </dl>
    </section>
  );
}
