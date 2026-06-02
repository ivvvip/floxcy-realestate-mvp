'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight,
  Database, Info, Loader2, Sparkles, TrendingUp, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { getOpportunitiesFiltered } from '@/lib/api';
import { formatAED, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type {
  OpportunitiesFilteredResponse, OpportunityFilteredItem, SupplyRiskTier,
} from '@/lib/types';

type Goal = 'income' | 'growth' | 'balanced' | 'offplan';
type Risk = 'low' | 'medium' | 'high';
type Budget = 'lt500k' | '500k-1m' | '1m-3m' | '3m+';
type PType = 'apartment' | 'villa' | 'offplan' | 'any';

const BUDGET_MAX: Record<Budget, number | null> = {
  lt500k: 500_000,
  '500k-1m': 1_000_000,
  '1m-3m': 3_000_000,
  '3m+': null,
};

const SUPPLY_TONE: Record<SupplyRiskTier, string> = {
  low: 'text-positive bg-positive/10 border-positive/30',
  medium: 'text-fg-muted bg-bg-elev border-border',
  high: 'text-warning bg-warning/10 border-warning/30',
};

const SUPPLY_DOT: Record<SupplyRiskTier, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🔴',
};

export function DldOpportunitiesPanel() {
  const [goal, setGoal] = useState<Goal>('balanced');
  const [risk, setRisk] = useState<Risk>('medium');
  const [budget, setBudget] = useState<Budget | 'any'>('any');
  const [ptype, setPType] = useState<PType>('any');
  const [data, setData] = useState<OpportunitiesFilteredResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await getOpportunitiesFiltered({
          goal,
          risk,
          budget_aed_max: budget !== 'any' ? BUDGET_MAX[budget] ?? undefined : undefined,
          property_type: ptype !== 'any' ? ptype : undefined,
          limit: 12,
        });
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goal, risk, budget, ptype]);

  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
            DLD-grounded opportunities
            <span className="pill pill-accent text-[10px]">Real data</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Every metric on every card is sourced from DLD ETL tables — yield,
            rent growth, 5y appreciation, supply share. No fabrication.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowFormula((v) => !v)}
          className="text-[11px] text-accent hover:text-accent/80 inline-flex items-center gap-1"
        >
          <Info className="h-3 w-3" strokeWidth={2.5} />
          How we score
          <ChevronDown className={cn('h-3 w-3 transition-transform', showFormula && 'rotate-180')} strokeWidth={2.5} />
        </button>
      </div>

      {/* Filter rail */}
      <div className="border-b border-border bg-bg-elev/20 px-4 py-3 space-y-2">
        <FilterRow label="Goal">
          {(['income', 'growth', 'balanced', 'offplan'] as Goal[]).map((g) => (
            <Chip key={g} active={goal === g} onClick={() => setGoal(g)}>
              {g === 'offplan' ? 'Off-plan' : g.charAt(0).toUpperCase() + g.slice(1)}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Budget">
          {(['any', 'lt500k', '500k-1m', '1m-3m', '3m+'] as const).map((b) => (
            <Chip key={b} active={budget === b} onClick={() => setBudget(b)}>
              {b === 'any' ? 'Any' : b === 'lt500k' ? '<500K' : b === '500k-1m' ? '500K–1M' : b === '1m-3m' ? '1M–3M' : '3M+'}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Risk">
          {(['low', 'medium', 'high'] as Risk[]).map((r) => (
            <Chip key={r} active={risk === r} onClick={() => setRisk(r)}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Type">
          {(['any', 'apartment', 'villa', 'offplan'] as PType[]).map((t) => (
            <Chip key={t} active={ptype === t} onClick={() => setPType(t)}>
              {t === 'any' ? 'Any' : t === 'offplan' ? 'Off-plan' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Chip>
          ))}
        </FilterRow>
      </div>

      {showFormula && data && (
        <div className="border-b border-border bg-bg-elev/10 px-4 py-3">
          <p className="text-xs text-fg-muted">
            <span className="font-medium text-fg">Score = </span>
            {fmtPct(data.formula.yield_weight)} yield +{' '}
            {fmtPct(data.formula.rent_growth_weight)} rent growth +{' '}
            {fmtPct(data.formula.appreciation_weight)} 5y appreciation +{' '}
            {fmtPct(data.formula.demand_weight)} demand +{' '}
            {fmtPct(data.formula.low_supply_risk_weight)} low supply risk
          </p>
          <p className="mt-1.5 text-[10px] text-fg-subtle">
            Each component normalised 0–1 against Dubai-wide bounds. Goal shifts
            the weights (e.g. <span className="text-fg">income</span> reweights
            heavily toward yield + rent growth; <span className="text-fg">offplan</span>
            {' '}actively prefers high off-plan share).
          </p>
        </div>
      )}

      <div className="p-4">
        {loading ? (
          <div className="py-12 text-center text-fg-subtle text-xs inline-flex items-center justify-center gap-2 w-full">
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
            Scoring areas…
          </div>
        ) : error ? (
          <div className="border border-negative/30 bg-negative/10 rounded-md p-3 text-xs text-negative inline-flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={2} />
            {error}
          </div>
        ) : !data || !data.items.length ? (
          <p className="py-12 text-center text-fg-subtle text-xs">
            No areas match these filters. Loosen the budget or try a different goal.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.items.map((it) => (
              <OpportunityCard key={it.area_id} item={it} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-2 text-[10px] text-fg-subtle flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-2.5 w-2.5" strokeWidth={2.5} />
          DLD Sales of Units + Ejari + Price History + Area Appreciation + Land Registry
        </span>
        {data && (
          <span className="tabular">
            {data.count} areas matched · last updated {data.last_updated}
          </span>
        )}
      </div>
    </section>
  );
}

function OpportunityCard({ item }: { item: OpportunityFilteredItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        'border rounded-lg bg-bg-card hover:border-accent/40 transition-colors',
        item.confidence === 'low' ? 'border-border/60 opacity-90' : 'border-border'
      )}
    >
      <div className="p-3.5 space-y-2.5">
        {/* Rank + area */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-mono text-fg-subtle">#{item.rank}</span>
            <h3 className="text-sm font-medium text-fg leading-tight">{item.area_name}</h3>
          </div>
          <div className="text-right">
            <div className="text-base font-semibold tabular text-accent">{item.score.toFixed(0)}</div>
            <div className="text-[9px] text-fg-subtle uppercase tracking-wide">score</div>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1">
          {item.supply_risk && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border tabular', SUPPLY_TONE[item.supply_risk])}>
              {SUPPLY_DOT[item.supply_risk]} {item.supply_risk.toUpperCase()} supply
            </span>
          )}
          {item.investor_visa_eligible && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent tabular inline-flex items-center gap-1">
              <BadgeCheck className="h-2.5 w-2.5" strokeWidth={2.5} />
              Investor Visa
            </span>
          )}
          {item.freehold_pct != null && item.freehold_pct >= 50 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-bg-elev text-fg-muted tabular">
              {item.freehold_pct.toFixed(0)}% freehold
            </span>
          )}
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border tabular',
              item.confidence === 'high'
                ? 'border-positive/30 bg-positive/10 text-positive'
                : item.confidence === 'medium'
                  ? 'border-fg-muted/30 bg-bg-elev text-fg-muted'
                  : 'border-warning/30 bg-warning/10 text-warning'
            )}
            title={`${item.sales_sample_count} sales + ${item.rent_sample_count} rent contracts`}
          >
            {item.confidence} confidence
          </span>
        </div>

        {/* Core metrics */}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Metric
            label="Gross yield"
            value={item.gross_yield_pct != null ? `${item.gross_yield_pct.toFixed(2)}%` : '—'}
            accent
          />
          <Metric
            label="Rent YoY"
            value={item.rent_growth_yoy_pct != null
              ? `${item.rent_growth_yoy_pct >= 0 ? '+' : ''}${item.rent_growth_yoy_pct.toFixed(1)}%`
              : '—'}
            tone={
              item.rent_growth_yoy_pct == null ? 'neutral' :
              item.rent_growth_yoy_pct >= 5 ? 'positive' :
              item.rent_growth_yoy_pct < 0 ? 'negative' : 'neutral'
            }
          />
          <Metric
            label="5y appr."
            value={item.appreciation_5y_pct != null ? `+${item.appreciation_5y_pct.toFixed(0)}%` : '—'}
            sublabel={item.cagr_5y_pct != null ? `CAGR ${item.cagr_5y_pct.toFixed(1)}%` : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Metric
            label="Median AED/sqft"
            value={item.median_price_per_sqft != null ? formatNumber(item.median_price_per_sqft, 0) : '—'}
          />
          <Metric
            label="Transactions"
            value={formatNumber(item.transaction_count, 0)}
          />
        </div>

        {/* Reasoning toggle */}
        {item.reasoning.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-fg-subtle hover:text-fg inline-flex items-center gap-1"
          >
            <ChevronRight className={cn('h-2.5 w-2.5 transition-transform', expanded && 'rotate-90')} strokeWidth={2.5} />
            Why this rank? ({item.reasoning.length} cited)
          </button>
        )}
        {expanded && (
          <ul className="space-y-1 text-[11px] text-fg-muted border-t border-border/40 pt-2">
            {item.reasoning.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
          <Link
            href={`/areas/${item.area_id}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-fg-muted hover:text-fg hover:border-accent/40"
          >
            Explore <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.5} />
          </Link>
          <Link
            href={`/roi-calculator?area=${encodeURIComponent(item.area_name)}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-fg-muted hover:text-fg hover:border-accent/40"
          >
            ROI <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.5} />
          </Link>
          <Link
            href={`/brokers/directory?area=${encodeURIComponent(item.area_name)}`}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-accent/10 border border-accent/30 px-2 text-[10px] text-accent hover:bg-accent/20"
          >
            Broker
          </Link>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label, value, sublabel, accent, tone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const c =
    tone === 'positive' ? 'text-positive' :
    tone === 'negative' ? 'text-negative' :
    accent ? 'text-accent' : 'text-fg';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={cn('mt-0.5 font-medium tabular', c)}>{value}</div>
      {sublabel && <div className="text-[9px] text-fg-subtle tabular">{sublabel}</div>}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium w-12">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-bg-elev/40 text-fg-muted hover:text-fg'
      )}
    >
      {children}
    </button>
  );
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

// Suppress unused-icon warnings
void ShieldAlert; void ShieldCheck;
void formatAED;
