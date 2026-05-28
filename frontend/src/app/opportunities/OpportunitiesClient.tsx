'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BellPlus,
  Info,
  Sparkles,
  Loader2,
  MapPin,
} from 'lucide-react';
import type {
  OpportunityExplanation,
  OpportunityResult,
  OpportunityType,
} from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FilterChip } from '@/components/data/FilterChip';
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge';
import { DataBadge } from '@/components/data/DataBadge';
import { createAlert, explainOpportunity } from '@/lib/api';

const TYPES: { value: OpportunityType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Premium Hold', label: 'Premium Hold' },
  { value: 'Growth Opportunity', label: 'Growth' },
  { value: 'Speculative', label: 'Speculative' },
  { value: 'Income Opportunity', label: 'Income' },
  { value: 'Value Opportunity', label: 'Value' },
  { value: 'Balanced', label: 'Balanced' },
];

const TYPE_TONE: Record<OpportunityType, string> = {
  'Premium Hold': 'pill-accent',
  'Growth Opportunity': 'pill-positive',
  Speculative: 'pill-negative',
  'Income Opportunity': 'pill-positive',
  'Value Opportunity': 'pill-accent',
  Balanced: '',
};

function scoreTone(score: number): string {
  if (score >= 75) return 'text-positive';
  if (score >= 60) return 'text-accent';
  if (score >= 45) return 'text-fg-muted';
  return 'text-negative';
}

interface Props {
  opportunities: OpportunityResult[];
  total: number;
}

export function OpportunitiesClient({ opportunities, total }: Props) {
  const [type, setType] = useState<OpportunityType | 'all'>('all');
  const [minScore, setMinScore] = useState(60);
  const [sortBy, setSortBy] = useState<'score' | 'yield' | 'appreciation'>('score');
  const [expanded, setExpanded] = useState<string | null>(
    opportunities[0]?.area_id ?? null
  );

  const filtered = useMemo(() => {
    let list = opportunities;
    if (type !== 'all') list = list.filter((o) => o.opportunity_type === type);
    list = list.filter((o) => o.opportunity_score >= minScore);
    const key = (o: OpportunityResult) => {
      switch (sortBy) {
        case 'yield':
          return o.key_metrics.rental_yield;
        case 'appreciation':
          return o.key_metrics.appreciation_1y ?? 0;
        default:
          return o.opportunity_score;
      }
    };
    return [...list].sort((a, b) => key(b) - key(a));
  }, [opportunities, type, minScore, sortBy]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: opportunities.length };
    for (const o of opportunities) c[o.opportunity_type] = (c[o.opportunity_type] || 0) + 1;
    return c;
  }, [opportunities]);

  async function subscribeAlert() {
    try {
      await createAlert({
        type: 'opportunity_appears',
        params: { type: 'Growth Opportunity' },
        delivery: 'in_app',
      });
      alert('Alert created — notify on new Growth Opportunities.');
    } catch {
      alert('Could not create alert. Try again.');
    }
  }

  if (!opportunities.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-10 text-center">
        <p className="text-sm text-fg-muted">No opportunities computed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {TYPES.map((t) => (
          <FilterChip
            key={t.value}
            label={t.label}
            count={counts[t.value] ?? 0}
            active={type === t.value}
            onClick={() => setType(t.value)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs">
        <label className="inline-flex items-center gap-2">
          <span className="text-fg-muted">Min score</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-32 accent-accent"
          />
          <span className="tabular text-fg w-8">{minScore}</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <span className="text-fg-muted">Sort by</span>
          <div className="segmented">
            {(['score', 'yield', 'appreciation'] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-active={sortBy === k}
                onClick={() => setSortBy(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </label>
        <button
          type="button"
          onClick={subscribeAlert}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
        >
          <BellPlus className="h-3.5 w-3.5" strokeWidth={2} />
          Alert me on new Growth opportunities
        </button>
      </div>

      <div className="text-[11px] text-fg-subtle">
        Showing {filtered.length} of {total} opportunities · sorted by {sortBy}
      </div>

      <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                <th>Area</th>
                <th>Type</th>
                <th className="text-right">Score</th>
                <th className="text-right">Yield</th>
                <th className="text-right">AED/sqft</th>
                <th className="text-right">1Y App</th>
                <th>Confidence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <OpportunityRow
                  key={o.area_id}
                  rank={i + 1}
                  opp={o}
                  expanded={expanded === o.area_id}
                  onToggle={() =>
                    setExpanded((cur) => (cur === o.area_id ? null : o.area_id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-fg-subtle flex items-start gap-2">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" strokeWidth={2} />
        <span>
          Scoring formula:{' '}
          <code className="text-fg-muted">
            0.30·yield + 0.25·appreciation + 0.25·value + 0.10·demand +
            0.10·inv_risk
          </code>
          . Classifier: Premium Hold → Growth → Speculative → Income → Value → Balanced.
          See{' '}
          <Link href="/methodology" className="text-accent hover:underline">
            methodology
          </Link>
          . Not investment advice.
        </span>
      </div>
    </div>
  );
}

function OpportunityRow({
  rank,
  opp,
  expanded,
  onToggle,
}: {
  rank: number;
  opp: OpportunityResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeClass = cn('pill', TYPE_TONE[opp.opportunity_type] ?? '');
  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="num text-fg-subtle">{rank}</td>
        <td>
          <Link
            href={`/areas/${opp.area_id}`}
            className="font-medium text-fg hover:text-accent transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {opp.area_name}
          </Link>
          {opp.area_name_arabic && (
            <div className="text-[10px] text-fg-muted" dir="rtl">
              {opp.area_name_arabic}
            </div>
          )}
        </td>
        <td>
          <span className={typeClass}>{opp.opportunity_type}</span>
        </td>
        <td className={cn('num font-semibold', scoreTone(opp.opportunity_score))}>
          {opp.opportunity_score}
        </td>
        <td className="num">{formatPercent(opp.key_metrics.rental_yield, 2)}</td>
        <td className="num">{formatNumber(opp.key_metrics.price_per_sqft, 0)}</td>
        <td className="num">
          <DataBadge value={opp.key_metrics.appreciation_1y} format="percent" />
        </td>
        <td>
          <ConfidenceBadge report={opp.data_confidence ?? null} compact />
        </td>
        <td className="num">
          <ArrowUpRight
            className={cn(
              'inline h-3 w-3 text-fg-subtle transition-transform',
              expanded && 'rotate-90'
            )}
            strokeWidth={2}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-bg-elev/30">
          <td colSpan={9}>
            <ExpandedDetail opp={opp} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ opp }: { opp: OpportunityResult }) {
  const [llm, setLlm] = useState<OpportunityExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAi() {
    if (llm || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await explainOpportunity(opp.area_id);
      setLlm(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI unavailable');
    } finally {
      setLoading(false);
    }
  }

  const why = llm?.why ?? opp.why;
  const risks = llm?.risks ?? opp.risks;
  const bestFor = llm?.best_for ?? opp.best_for;
  const strategy = llm?.strategy ?? opp.strategy;
  const source = llm ? 'ai' : 'rules';

  return (
    <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            {source === 'ai' ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <Sparkles className="h-3 w-3" strokeWidth={2} />
                AI-grounded explanation
              </span>
            ) : (
              <>Rules-based explanation</>
            )}
          </div>
          {!llm && (
            <button
              type="button"
              onClick={loadAi}
              disabled={loading}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              ) : (
                <Sparkles className="h-3 w-3" strokeWidth={2} />
              )}
              {loading ? 'Generating…' : 'Upgrade to AI explanation'}
            </button>
          )}
        </div>
        {error && <div className="text-[11px] text-negative">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Why
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
              {why.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-positive" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Risks
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
              {risks.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-negative" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Best for
            </div>
            <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">{bestFor}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Suggested strategy
            </div>
            <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">{strategy}</p>
          </div>
        </div>

        {llm?.model && (
          <div className="text-[10px] text-fg-subtle italic">
            AI: {llm.model.split('/').pop()} · {llm.tokens} tokens · {llm.cached ? 'cached' : 'fresh'}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {opp.data_confidence && <ConfidenceBadge report={opp.data_confidence} />}

        {opp.nearby_comparison && opp.nearby_comparison.length > 0 && (
          <div className="border border-border rounded-lg bg-bg-card">
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                Nearby (3 closest)
              </span>
            </div>
            <table className="data-table">
              <tbody>
                {opp.nearby_comparison.map((n) => (
                  <tr key={n.area_id}>
                    <td>
                      <Link
                        href={`/areas/${n.area_id}`}
                        className="text-fg hover:text-accent text-xs"
                      >
                        {n.area_name}
                      </Link>
                      <div className="text-[10px] text-fg-subtle tabular">
                        {n.distance_km.toFixed(1)} km ·{' '}
                        {formatNumber(n.price_per_sqft, 0)} AED/sqft ·{' '}
                        {formatPercent(n.rental_yield, 1)}
                      </div>
                    </td>
                    <td className="num">
                      <span
                        className={cn(
                          'pill',
                          TYPE_TONE[n.opportunity_type] ?? ''
                        )}
                        title={n.opportunity_type}
                      >
                        {n.opportunity_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border border-border rounded-lg bg-bg-card">
          <div className="chart-header">
            <span className="chart-header-label">Score components</span>
          </div>
          <table className="data-table">
            <tbody>
              {Object.entries(opp.components).map(([k, v]) => (
                <tr key={k}>
                  <td className="text-fg-muted text-[11px] capitalize">{k}</td>
                  <td className="num text-[11px] tabular">{(v * 100).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link
          href={`/areas/${opp.area_id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
        >
          Open full area detail
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
