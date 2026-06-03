'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight, Building2, Sparkles, ShieldCheck, ChevronDown, Search,
} from 'lucide-react';
import type {
  AreaSignalFeedItem,
  BrokerDealFeedItem,
  OpportunityFeedItem,
} from '@/lib/types';
import { formatAED, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FilterChip } from '@/components/data/FilterChip';
import { AreaSelector } from '@/components/AreaSelector';

interface AreaOption {
  name: string;
  name_norm: string;
  occurrence_count: number;
}

type KindFilter = 'all' | 'deals' | 'signals';
type StrategyFilter =
  | 'all'
  | 'income' | 'growth' | 'balanced' | 'luxury' | 'high-risk';

const STRATEGY_LABELS: Record<StrategyFilter, string> = {
  all: 'All strategies',
  income: 'Income',
  growth: 'Growth',
  balanced: 'Balanced',
  luxury: 'Luxury',
  'high-risk': 'High risk',
};

function scoreTone(score: number): string {
  if (score >= 75) return 'text-positive';
  if (score >= 60) return 'text-accent';
  if (score >= 45) return 'text-fg-muted';
  return 'text-negative';
}

const RISK_TONE: Record<string, string> = {
  low: 'text-positive',
  medium: 'text-fg-muted',
  high: 'text-negative',
};

interface Props {
  opportunities: OpportunityFeedItem[];
  total: number;
  areaOptions: AreaOption[];
}

export function OpportunitiesClient({ opportunities, total, areaOptions }: Props) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [strategy, setStrategy] = useState<StrategyFilter>('all');
  const [minScore, setMinScore] = useState(0);
  // Selected canonical area. null = "All areas". Matched substring-style
  // against opportunity.area_name so DLD-only canonical entries still work
  // even if the feed uses a slightly different spelling.
  const [area, setArea] = useState<AreaOption | null>(null);

  const filtered = useMemo(() => {
    let list = opportunities;
    if (kind === 'deals') list = list.filter((o) => o.kind === 'broker_deal');
    if (kind === 'signals') list = list.filter((o) => o.kind === 'area_signal');
    if (strategy !== 'all') {
      list = list.filter((o) =>
        o.kind === 'broker_deal' ? o.strategy === strategy : true
      );
    }
    list = list.filter((o) => o.opportunity_score >= minScore);
    if (area) {
      const q = area.name.toLowerCase();
      list = list.filter((o) => o.area_name.toLowerCase().includes(q));
    }
    return [...list].sort(
      (a, b) => b.opportunity_score - a.opportunity_score
    );
  }, [opportunities, kind, strategy, minScore, area]);

  const counts = useMemo(() => {
    const c = { all: opportunities.length, deals: 0, signals: 0 };
    for (const o of opportunities) {
      if (o.kind === 'broker_deal') c.deals++;
      else c.signals++;
    }
    return c;
  }, [opportunities]);

  if (!opportunities.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-10 text-center">
        <p className="text-sm text-fg-muted">No opportunities available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip
          label="All"
          count={counts.all}
          active={kind === 'all'}
          onClick={() => setKind('all')}
        />
        <FilterChip
          label="Curated Deals"
          count={counts.deals}
          active={kind === 'deals'}
          onClick={() => setKind('deals')}
        />
        <FilterChip
          label="Market Signals"
          count={counts.signals}
          active={kind === 'signals'}
          onClick={() => setKind('signals')}
        />
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4 flex-wrap text-xs">
        <div className="w-48">
          <AreaSelector value={area} onChange={setArea} options={areaOptions} />
        </div>
        <label className="inline-flex items-center gap-2">
          <span className="text-fg-muted">Strategy</span>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as StrategyFilter)}
            className="h-8 rounded-md border border-border bg-bg-card px-2 text-fg text-xs"
          >
            {(Object.keys(STRATEGY_LABELS) as StrategyFilter[]).map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          <span className="text-fg-muted">Min score</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-28 accent-accent"
          />
          <span className="tabular text-fg w-8">{minScore}</span>
        </label>
      </div>

      <div className="text-[11px] text-fg-subtle">
        Showing {filtered.length} of {total} opportunities
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((o) =>
          o.kind === 'broker_deal' ? (
            <DealCard key={`deal-${o.id}`} deal={o} />
          ) : (
            <SignalCard key={`signal-${o.area_id}`} signal={o} />
          )
        )}
      </div>

      <div className="text-[11px] text-fg-subtle">
        Curated by Floxcy. Verified investment specialists submit deals;
        every deal is reviewed before publication. Not investment advice.
      </div>
    </div>
  );
}

function DealCard({ deal }: { deal: BrokerDealFeedItem }) {
  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden hover:border-accent/40 transition-colors">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="pill pill-accent inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" strokeWidth={2} />
            Curated Deal
          </span>
          <span
            className={cn('text-lg font-semibold tabular', scoreTone(deal.opportunity_score))}
            title="Opportunity score"
          >
            {deal.opportunity_score.toFixed(0)}
          </span>
        </div>

        <div>
          <h3 className="text-sm font-medium text-fg leading-snug">
            {deal.title}
          </h3>
          <div className="mt-1 text-[11px] text-fg-muted">
            {deal.area_name} · {deal.emirate} · {deal.property_type}
            {deal.unit_type ? ` · ${deal.unit_type}` : ''}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <div className="text-fg-subtle uppercase tracking-wide">Price</div>
            <div className="text-fg tabular">{formatAED(deal.price, { compact: true })}</div>
          </div>
          <div>
            <div className="text-fg-subtle uppercase tracking-wide">Yield</div>
            <div className="text-fg tabular">
              {deal.rental_yield != null ? formatPercent(deal.rental_yield, 2) : '—'}
            </div>
          </div>
          <div>
            <div className="text-fg-subtle uppercase tracking-wide">Risk</div>
            <div className={cn('tabular capitalize', RISK_TONE[deal.risk_level] ?? 'text-fg')}>
              {deal.risk_level}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-fg-muted leading-relaxed line-clamp-3">
          {deal.why_short}
        </p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] text-fg-subtle">
            {deal.broker?.full_name && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" strokeWidth={2} />
                {deal.broker.company_name || deal.broker.full_name}
              </span>
            )}
            <span className="ml-2 capitalize">· {deal.strategy}</span>
          </div>
          <Link
            href={`/opportunities/${deal.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
          >
            View Opportunity
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: AreaSignalFeedItem }) {
  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden hover:border-accent/40 transition-colors">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="pill inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Market Signal
          </span>
          <span
            className={cn('text-lg font-semibold tabular', scoreTone(signal.opportunity_score))}
            title="Opportunity score"
          >
            {signal.opportunity_score.toFixed(0)}
          </span>
        </div>

        <div>
          <h3 className="text-sm font-medium text-fg leading-snug">
            {signal.area_name}
          </h3>
          <div className="mt-1 text-[11px] text-fg-muted">
            {signal.opportunity_type}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <div className="text-fg-subtle uppercase tracking-wide">AED/sqft</div>
            <div className="text-fg tabular">
              {formatNumber(signal.key_metrics.price_per_sqft, 0)}
            </div>
          </div>
          <div>
            <div className="text-fg-subtle uppercase tracking-wide">Yield</div>
            <div className="text-fg tabular">
              {formatPercent(signal.key_metrics.rental_yield, 2)}
            </div>
          </div>
          <div>
            <div className="text-fg-subtle uppercase tracking-wide">1Y App</div>
            <div className="text-fg tabular">
              {signal.key_metrics.appreciation_1y != null
                ? formatPercent(signal.key_metrics.appreciation_1y, 1)
                : '—'}
            </div>
          </div>
        </div>

        {signal.why?.length > 0 && (
          <p className="text-[11px] text-fg-muted leading-relaxed line-clamp-3">
            {signal.why[0]}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] text-fg-subtle capitalize">
            {signal.strategy}
          </div>
          <Link
            href={`/areas/${signal.area_id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
          >
            Area Detail
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </div>
  );
}

