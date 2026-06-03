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

const QUADRANT_LABELS = {
  best_investment: { text: '🏆 Best Investment', tone: 'positive' },
  income_focus:    { text: '💰 Income Focus',    tone: 'accent'   },
  growth_focus:    { text: '📈 Growth Focus',    tone: 'accent'   },
  avoid:           { text: '⚠️ Avoid',           tone: 'warning'  },
} as const;

const SENTIMENT_DISPLAY = {
  bullish: { emoji: '🟢', label: 'BULLISH', tone: 'positive', subtitle: 'Multiple positive signals across DLD data.' },
  neutral: { emoji: '🟡', label: 'NEUTRAL', tone: 'fg',       subtitle: 'Mixed signals — wait for stronger trend.' },
  bearish: { emoji: '🔴', label: 'BEARISH', tone: 'negative', subtitle: 'Negative signals outweigh positives.' },
} as const;

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
      <SentimentHero pulse={pulse} />
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
// 1. Market sentiment hero
// ---------------------------------------------------------------------------

function SentimentHero({ pulse }: { pulse: DashboardPulseResponse }) {
  const s = SENTIMENT_DISPLAY[pulse.sentiment.signal];
  return (
    <section
      className={cn(
        'rounded-lg border p-4 sm:p-5',
        pulse.sentiment.signal === 'bullish' && 'border-positive/40 bg-positive/5',
        pulse.sentiment.signal === 'neutral' && 'border-border bg-bg-card',
        pulse.sentiment.signal === 'bearish' && 'border-negative/40 bg-negative/5',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            Market sentiment
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl">{s.emoji}</span>
            <span
              className={cn(
                'text-2xl font-semibold',
                s.tone === 'positive' && 'text-positive',
                s.tone === 'negative' && 'text-negative',
                s.tone === 'fg' && 'text-fg',
              )}
            >
              {s.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-muted">{s.subtitle}</p>
        </div>
        <div className="text-[11px] text-fg-subtle text-right">
          Based on{' '}
          <span className="font-mono text-fg">{pulse.sentiment.factors.length}</span>{' '}
          factors from DLD data
        </div>
      </div>
      {pulse.sentiment.factors.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {pulse.sentiment.factors.map((f) => (
            <div
              key={f.name}
              className="rounded border border-border bg-bg-card px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-fg-subtle truncate">
                {f.name}
              </div>
              <div
                className={cn(
                  'mt-1 text-sm font-mono tabular',
                  f.tone === 'positive' && 'text-positive',
                  f.tone === 'negative' && 'text-negative',
                  f.tone === 'neutral' && 'text-fg',
                )}
              >
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. Yield vs Appreciation 4-quadrant scatter
// ---------------------------------------------------------------------------

function YieldVsAppreciationMatrix({ pulse }: { pulse: DashboardPulseResponse }) {
  const points = pulse.matrix_points;
  if (points.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="text-sm font-semibold text-fg">
          Yield × 5-year appreciation
        </h3>
        <p className="mt-2 text-xs text-fg-subtle">
          No areas with full yield + appreciation history yet.
        </p>
      </section>
    );
  }
  const W = 320;
  const H = 280;
  const PAD = 32;
  const xs = points.map((p) => p.appreciation_5y_pct);
  const ys = points.map((p) => p.yield_pct);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 50);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 12);
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);
  // Quadrant midlines (already computed server-side via medians)
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  const xMid = sortedX[Math.floor(sortedX.length / 2)];
  const yMid = sortedY[Math.floor(sortedY.length / 2)];

  return (
    <section className="card p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">
            Yield × 5-year appreciation
          </h3>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            {points.length.toLocaleString()} areas · hover any dot
          </p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Yield vs 5y appreciation scatter"
        >
          {/* Quadrant background tints */}
          <rect x={sx(xMid)} y={PAD} width={W - PAD - sx(xMid)} height={sy(yMid) - PAD}
                fill="rgb(34,197,94)" fillOpacity="0.08" />
          <rect x={PAD} y={PAD} width={sx(xMid) - PAD} height={sy(yMid) - PAD}
                fill="rgb(56,189,248)" fillOpacity="0.06" />
          <rect x={sx(xMid)} y={sy(yMid)} width={W - PAD - sx(xMid)} height={H - PAD - sy(yMid)}
                fill="rgb(56,189,248)" fillOpacity="0.06" />
          <rect x={PAD} y={sy(yMid)} width={sx(xMid) - PAD} height={H - PAD - sy(yMid)}
                fill="rgb(244,63,94)" fillOpacity="0.06" />
          {/* Midlines */}
          <line x1={sx(xMid)} y1={PAD} x2={sx(xMid)} y2={H - PAD}
                stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" />
          <line x1={PAD} y1={sy(yMid)} x2={W - PAD} y2={sy(yMid)}
                stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" />
          {/* Axes */}
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD}
                stroke="currentColor" strokeOpacity="0.35" />
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD}
                stroke="currentColor" strokeOpacity="0.35" />
          {/* Quadrant labels */}
          <text x={W - PAD - 6} y={PAD + 14} textAnchor="end" fontSize="10"
                fill="rgb(34,197,94)" fontWeight="600">🏆 Best Investment</text>
          <text x={PAD + 6} y={PAD + 14} textAnchor="start" fontSize="10"
                fill="rgb(56,189,248)" fontWeight="600">💰 Income</text>
          <text x={W - PAD - 6} y={H - PAD - 6} textAnchor="end" fontSize="10"
                fill="rgb(56,189,248)" fontWeight="600">📈 Growth</text>
          <text x={PAD + 6} y={H - PAD - 6} textAnchor="start" fontSize="10"
                fill="rgb(244,63,94)" fontWeight="600">⚠️ Avoid</text>
          {/* Axis labels */}
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="9"
                fill="currentColor" opacity="0.65">5y appreciation %</text>
          <text x={10} y={H / 2} textAnchor="middle" fontSize="9"
                fill="currentColor" opacity="0.65"
                transform={`rotate(-90 10 ${H / 2})`}>Yield %</text>
          {/* Dots */}
          {points.map((p) => {
            const q = QUADRANT_LABELS[p.quadrant];
            const r = Math.max(2.5, Math.min(7, Math.log10(p.sample_score + 1) * 2));
            return (
              <a key={p.area_name_norm} href={`/areas/${encodeURIComponent(p.area_name_norm.replace(/ /g, '-'))}`}>
                <circle
                  cx={sx(p.appreciation_5y_pct)}
                  cy={sy(p.yield_pct)}
                  r={r}
                  className={cn(
                    'transition-opacity hover:opacity-100',
                    q.tone === 'positive' && 'fill-positive',
                    q.tone === 'warning' && 'fill-negative',
                    q.tone === 'accent' && 'fill-accent',
                  )}
                  fillOpacity={0.75}
                >
                  <title>
                    {p.area_name_display} · Yield {p.yield_pct.toFixed(1)}% · 5y {p.appreciation_5y_pct.toFixed(0)}%
                  </title>
                </circle>
              </a>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

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
      <h3 className="text-sm font-semibold text-fg">Dubai rent-vs-buy index</h3>
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
                href={`/areas/${encodeURIComponent(h.area_name_norm.replace(/ /g, '-'))}`}
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
                  href={`/areas/${encodeURIComponent(a.area_name_norm.replace(/ /g, '-'))}`}
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
