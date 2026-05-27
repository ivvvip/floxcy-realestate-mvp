'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight, ArrowUpRight } from 'lucide-react';
import { advisorQuery } from '@/lib/api';
import type {
  AdvisorGoal,
  AdvisorQueryResponse,
  AdvisorRecommendation,
  AdvisorRisk,
} from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const GOALS: { value: AdvisorGoal; label: string }[] = [
  { value: 'yield', label: 'Cash flow' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'appreciation', label: 'Growth' },
];

const RISKS: {
  value: AdvisorRisk;
  label: string;
  tone: 'positive' | 'neutral' | 'negative';
}[] = [
  { value: 'low', label: 'Low', tone: 'positive' },
  { value: 'med', label: 'Medium', tone: 'neutral' },
  { value: 'high', label: 'High', tone: 'negative' },
];

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000];

export function AdvisorClient() {
  const [budget, setBudget] = useState(1_500_000);
  const [goal, setGoal] = useState<AdvisorGoal>('balanced');
  const [risk, setRisk] = useState<AdvisorRisk>('med');
  const [result, setResult] = useState<AdvisorQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await advisorQuery({ budget_aed: budget, goal, risk });
      setResult(res);
      setExpanded(res.recommendations[0]?.area_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Form */}
      <form
        onSubmit={submit}
        className="lg:col-span-4 border border-border rounded-lg bg-bg-card h-fit"
      >
        <div className="chart-header">
          <span className="chart-header-label">Query parameters</span>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Budget (AED)
              </label>
              <span className="text-sm tabular text-fg font-medium">
                {formatAED(budget, { compact: true })}
              </span>
            </div>
            <input
              type="number"
              min={100_000}
              step={50_000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
              className="input-field mt-2"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBudget(p)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px] font-medium tabular transition-colors',
                    budget === p
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-border bg-bg-elev/50 text-fg-muted hover:text-fg'
                  )}
                >
                  {formatAED(p, { compact: true })}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Primary goal
            </label>
            <div className="segmented mt-2 w-full">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  data-active={goal === g.value}
                  onClick={() => setGoal(g.value)}
                  className="flex-1"
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Risk tolerance
            </label>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {RISKS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRisk(r.value)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    risk === r.value
                      ? r.tone === 'positive'
                        ? 'border-positive/40 bg-positive/10 text-positive'
                        : r.tone === 'negative'
                          ? 'border-negative/40 bg-negative/10 text-negative'
                          : 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-border bg-bg-elev/50 text-fg-muted hover:text-fg'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-accent text-sm font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Get recommendations'}
          </button>

          {error && (
            <p className="text-xs text-negative">Error: {error}</p>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="lg:col-span-8">
        {!result ? (
          <div className="border border-border rounded-lg bg-bg-card p-10 text-center">
            <h3 className="text-base font-semibold text-fg">
              Ready when you are
            </h3>
            <p className="mt-1 text-xs text-fg-muted">
              Set parameters and we&apos;ll rank the top UAE areas matched to your profile.
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
            <div className="chart-header">
              <span className="chart-header-label">
                Ranked recommendations · {result.recommendations.length}
              </span>
              <span className="text-[11px] text-fg-subtle tabular">
                Goal: {result.goal} · Risk: {result.risk}
              </span>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8 text-right">#</th>
                    <th>Area</th>
                    <th className="text-right">Score</th>
                    <th className="text-right">AED/sqft</th>
                    <th className="text-right">Yield</th>
                    <th className="text-right">1Y</th>
                    <th className="text-right">Risk</th>
                    <th className="text-right">Affordable sqft</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {result.recommendations.map((r) => (
                    <RecRow
                      key={r.area_id}
                      rec={r}
                      expanded={expanded === r.area_id}
                      onToggle={() =>
                        setExpanded((cur) =>
                          cur === r.area_id ? null : r.area_id
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecRow({
  rec,
  expanded,
  onToggle,
}: {
  rec: AdvisorRecommendation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const riskTone =
    rec.risk_score == null
      ? 'text-fg-subtle'
      : rec.risk_score <= 3
        ? 'text-positive'
        : rec.risk_score >= 7
          ? 'text-negative'
          : 'text-fg-muted';

  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) return;
          onToggle();
        }}
      >
        <td className="num text-fg-subtle">{rec.rank}</td>
        <td>
          <div className="font-medium text-fg">{rec.area_name}</div>
          {rec.area_name_arabic && (
            <div className="text-[11px] text-fg-muted" dir="rtl">
              {rec.area_name_arabic}
            </div>
          )}
        </td>
        <td className="num font-medium text-accent">
          {rec.score.toFixed(0)}
        </td>
        <td className="num">{formatNumber(rec.avg_price_per_sqft, 0)}</td>
        <td className="num">{formatPercent(rec.rental_yield, 2)}</td>
        <td className="num">
          {rec.appreciation_1y != null
            ? formatPercent(rec.appreciation_1y, 2)
            : '—'}
        </td>
        <td className={cn('num tabular', riskTone)}>
          {rec.risk_score != null ? rec.risk_score.toFixed(1) : '—'}
        </td>
        <td className="num">{formatNumber(rec.estimated_affordable_sqft)}</td>
        <td className="num">
          {expanded ? (
            <ChevronDown className="inline h-3.5 w-3.5 text-fg-subtle" strokeWidth={2} />
          ) : (
            <ChevronRight className="inline h-3.5 w-3.5 text-fg-subtle" strokeWidth={2} />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-bg-elev/30">
          <td colSpan={9} className="border-b border-border">
            <div className="px-5 py-4">
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium mb-2">
                Reasoning
              </div>
              <ul className="space-y-1.5 text-xs text-fg-muted">
                {rec.reasoning.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/areas/${rec.area_id}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
              >
                View area details
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
