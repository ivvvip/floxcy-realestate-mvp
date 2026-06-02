'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown, ChevronRight, ArrowUpRight, Calculator, MapPin, RotateCcw,
  Sparkles, Loader2, Users,
} from 'lucide-react';
import { advisorQuery } from '@/lib/api';
import type {
  AdvisorGoal,
  AdvisorQueryResponse,
  AdvisorRecommendation,
  AdvisorRisk,
} from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  AdvisorOnboarding,
  markOnboardingSeen,
  readOnboardingSeen,
  type OnboardingResult,
} from './AdvisorOnboarding';
import { AdvisorHistoryPanel, pushHistory, type HistoryEntry } from './AdvisorHistory';
import {
  BestBuildingLink,
  DataConfidencePanel,
  FollowupChips,
  InvestorVisaBadge,
  MarketTimingBadge,
  WhatIfPanel,
} from './AdvisorRecExtras';

// Map onboarding result → existing form state types
function onboardingToGoal(g: OnboardingResult['goal']): AdvisorGoal {
  if (g === 'income') return 'yield';
  if (g === 'growth') return 'appreciation';
  // 'both' and 'offplan' both map to balanced for the underlying API today;
  // the existing /advisor/query endpoint doesn't yet have an offplan goal
  // (only the new /opportunities-filtered endpoint does). Off-plan users
  // still benefit from the rest of the personalised flow.
  return 'balanced';
}

function onboardingToRisk(r: OnboardingResult['risk']): AdvisorRisk {
  if (r === 'conservative') return 'low';
  if (r === 'aggressive') return 'high';
  return 'med';
}

function onboardingToBudget(b: OnboardingResult['budget']): number {
  if (b === 'lt500k') return 400_000;
  if (b === '500k-1m') return 750_000;
  if (b === '1m-3m') return 2_000_000;
  return 5_000_000;
}

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

const CITIES = ['', 'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah'];

export function AdvisorClient() {
  const [budget, setBudget] = useState(1_500_000);
  const [goal, setGoal] = useState<AdvisorGoal>('balanced');
  const [risk, setRisk] = useState<AdvisorRisk>('med');
  const [city, setCity] = useState('');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AdvisorQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Onboarding state — surfaced on first visit only. Read once on mount
  // to avoid SSR hydration mismatch.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!readOnboardingSeen()) setShowOnboarding(true);
  }, []);

  // Auto-submit after onboarding completes
  const runQuery = async (overrides?: {
    budget?: number;
    goal?: AdvisorGoal;
    risk?: AdvisorRisk;
    city?: string;
    question?: string;
  }) => {
    setLoading(true);
    setError(null);
    const b = overrides?.budget ?? budget;
    const g = overrides?.goal ?? goal;
    const r = overrides?.risk ?? risk;
    const c = overrides?.city ?? city;
    const q = (overrides?.question ?? question).trim();
    try {
      const res = await advisorQuery({
        budget_aed: b,
        goal: g,
        risk: r,
        preferred_city: c || undefined,
        user_question: q || undefined,
      });
      setResult(res);
      setExpanded(res.recommendations[0]?.area_id ?? null);
      // Save history (best-effort; ignore failures)
      pushHistory({
        ts: new Date().toISOString(),
        budget_aed: b,
        goal: g,
        risk: r,
        preferred_city: c,
        user_question: q,
        top_picks: res.recommendations.slice(0, 3).map((rr) => rr.area_name),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runQuery();
  };

  const onOnboardingComplete = (o: OnboardingResult) => {
    const newBudget = onboardingToBudget(o.budget);
    const newGoal = onboardingToGoal(o.goal);
    const newRisk = onboardingToRisk(o.risk);
    // Echo timeline + off-plan preference as a user_question so the LLM
    // prompt knows about both, since the rules-based scorer can't see them.
    const q = [
      `Timeline: ${o.timeline.replace('y', ' years').replace('-', ' to ')}.`,
      o.goal === 'offplan' ? 'Prefer off-plan / pre-completion properties.' : '',
    ].filter(Boolean).join(' ');
    setBudget(newBudget);
    setGoal(newGoal);
    setRisk(newRisk);
    setQuestion(q);
    setShowOnboarding(false);
    void runQuery({ budget: newBudget, goal: newGoal, risk: newRisk, question: q });
  };

  const onResumeHistory = (h: HistoryEntry) => {
    setBudget(h.budget_aed);
    setGoal(h.goal);
    setRisk(h.risk);
    setCity(h.preferred_city);
    setQuestion(h.user_question);
    void runQuery({
      budget: h.budget_aed,
      goal: h.goal,
      risk: h.risk,
      city: h.preferred_city,
      question: h.user_question,
    });
  };

  const askFollowup = (q: string) => {
    setQuestion(q);
    void runQuery({ question: q });
  };

  const replayOnboarding = () => {
    setShowOnboarding(true);
  };
  // Suppress unused — exposed below in the JSX
  void replayOnboarding;

  const questionLen = question.length;

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Onboarding wizard — modal on first visit */}
      {showOnboarding && (
        <AdvisorOnboarding
          onComplete={onOnboardingComplete}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

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

          <div>
            <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Preferred city <span className="normal-case text-fg-subtle">(optional)</span>
            </label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input-field mt-2"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c || 'Any'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Question for the analyst <span className="normal-case text-fg-subtle">(optional)</span>
              </label>
              <span className={cn(
                'text-[10px] tabular',
                questionLen > 500 ? 'text-negative' : 'text-fg-subtle'
              )}>
                {questionLen}/500
              </span>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="e.g. should I prioritize JVC or Business Bay for cash flow?"
              className="input-field mt-2 resize-y leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-accent text-sm font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                Analyzing UAE market with AI…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                Get AI recommendations
              </>
            )}
          </button>

          {error && (
            <p className="text-xs text-negative">Error: {error}</p>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="lg:col-span-8 space-y-5">
        {!result ? (
          <div className="space-y-3">
            {/* History panel — only renders if localStorage has entries */}
            <AdvisorHistoryPanel onResume={onResumeHistory} />
            <div className="border border-border rounded-lg bg-bg-card p-10 text-center">
              <h3 className="text-base font-semibold text-fg">
                Ready when you are
              </h3>
              <p className="mt-1 text-xs text-fg-muted">
                Set parameters and we&apos;ll rank the top UAE areas matched to your profile,
                plus an AI-generated analysis of the picks.
              </p>
              <button
                type="button"
                onClick={replayOnboarding}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[11px] text-accent hover:border-accent/40"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
                Use the guided setup wizard
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* AI analysis panel (markdown) */}
            {result.analysis && (
              <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
                <div className="chart-header">
                  <span className="chart-header-label inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                    AI analysis
                  </span>
                  <div className="flex items-center gap-2">
                    {result.cached && (
                      <span className="pill">cached</span>
                    )}
                    {result.fallback_used && (
                      <span className="pill pill-negative">fallback</span>
                    )}
                    {result.model_used && (
                      <span className="pill" title={`Latency ${result.latency_ms ?? 0}ms`}>
                        {result.model_used.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>

                {result.confidence_score != null && (
                  <div className="border-b border-border px-4 py-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="uppercase tracking-wide text-fg-subtle font-medium">
                        AI confidence
                      </span>
                      <span className="tabular text-fg">
                        {Math.round(result.confidence_score * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 bg-bg-elev rounded">
                      <div
                        className={cn(
                          'h-1 rounded transition-all',
                          result.confidence_score >= 0.8
                            ? 'bg-positive'
                            : result.confidence_score >= 0.5
                              ? 'bg-accent'
                              : 'bg-negative'
                        )}
                        style={{ width: `${Math.round(result.confidence_score * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="p-5">
                  <article className="prose-floxcy">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      components={{
                        h2: (p) => <h2 className="text-base font-semibold text-fg mt-5 first:mt-0 mb-2" {...p} />,
                        h3: (p) => <h3 className="text-sm font-medium text-fg mt-4 mb-1.5" {...p} />,
                        p: (p) => <p className="text-sm text-fg-muted leading-relaxed mb-2" {...p} />,
                        ul: (p) => <ul className="space-y-1 text-sm text-fg-muted list-disc pl-5 mb-2" {...p} />,
                        ol: (p) => <ol className="space-y-1 text-sm text-fg-muted list-decimal pl-5 mb-2" {...p} />,
                        strong: (p) => <strong className="text-fg font-medium" {...p} />,
                        code: (p) => <code className="font-mono text-[12px] bg-bg-elev/60 px-1 py-0.5 rounded" {...p} />,
                        a: (p) => <a className="text-accent hover:underline" {...p} />,
                        hr: () => <hr className="border-border my-3" />,
                      }}
                    >
                      {result.analysis}
                    </ReactMarkdown>
                  </article>
                </div>

                <div className="border-t border-border bg-bg-elev/20 px-4 py-2 text-[11px] text-fg-subtle flex items-center justify-between flex-wrap gap-2">
                  <span>
                    AI-generated · model{' '}
                    <code className="font-mono text-fg">
                      {result.model_used ?? '—'}
                    </code>
                    {result.tokens_used != null && (
                      <> · <span className="tabular">{result.tokens_used}</span> tokens</>
                    )}
                    {result.cost_usd != null && result.cost_usd > 0 && (
                      <> · <span className="tabular">${result.cost_usd.toFixed(5)}</span></>
                    )}
                  </span>
                  <span className="italic">
                    Informational only · not financial advice
                  </span>
                </div>

                {/* Follow-up chips — populate question + auto-resubmit */}
                <div className="px-5 py-3 border-t border-border bg-bg-elev/10">
                  <FollowupChips
                    recommendations={result.recommendations}
                    onAsk={askFollowup}
                  />
                </div>
              </div>
            )}

            {/* Error notice when LLM failed */}
            {result.ai_error && !result.analysis && (
              <div className="border border-warning/30 bg-warning/10 rounded-md px-3 py-2 text-xs text-warning">
                AI analyst unavailable ({result.ai_error}). Showing rules-based ranking only.
              </div>
            )}

            {/* Rules-based ranked table */}
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
                        budgetAed={result.budget_aed}
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
          </>
        )}
      </div>
    </div>
  );
}

function RecRow({
  rec,
  expanded,
  onToggle,
  budgetAed,
}: {
  rec: AdvisorRecommendation;
  expanded: boolean;
  onToggle: () => void;
  budgetAed: number;
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
            <div className="px-5 py-4 space-y-4">
              {/* Badges row — visa eligibility + supply risk dot */}
              <div className="flex flex-wrap gap-1.5">
                <InvestorVisaBadge entryPriceAed={budgetAed} />
                {rec.supply_risk && (
                  <span className={cn(
                    'pill text-[10px] inline-flex items-center gap-1',
                    rec.supply_risk === 'low' ? 'pill-positive' :
                    rec.supply_risk === 'high' ? 'pill-negative' : ''
                  )}>
                    {rec.supply_risk === 'low' ? '🟢' : rec.supply_risk === 'high' ? '🔴' : '🟡'}
                    {' '}Supply: {rec.supply_risk}
                  </span>
                )}
              </div>

              <DldSignals rec={rec} />

              {/* Per-rec market timing — fetches on first expand */}
              <MarketTimingBadge areaName={rec.area_name} />

              <div>
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium mb-2">
                  Reasoning (cited DLD facts where available)
                </div>
                <ul className="space-y-1.5 text-xs text-fg-muted">
                  {rec.reasoning.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* DLD data panel + what-if scenarios (expandable) */}
              <DataConfidencePanel rec={rec} />
              <WhatIfPanel rec={rec} budgetAed={budgetAed} />

              {/* Footer CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
                <Link
                  href={`/areas/${rec.area_id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
                >
                  <MapPin className="h-3 w-3" strokeWidth={2.5} />
                  Area details
                  <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                </Link>
                <BestBuildingLink areaName={rec.area_name} />
                <Link
                  href={`/roi-calculator?area=${encodeURIComponent(rec.area_name)}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
                >
                  <Calculator className="h-3 w-3" strokeWidth={2.5} />
                  ROI calc
                </Link>
                <Link
                  href={`/brokers/directory?area=${encodeURIComponent(rec.area_name)}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
                >
                  <Users className="h-3 w-3" strokeWidth={2.5} />
                  Find broker
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SignalTile({
  label,
  value,
  source,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  source: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-fg';
  return (
    <div className="border border-border rounded-md bg-bg p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className={cn('mt-1 text-base font-semibold tabular', toneClass)}>
        {value}
      </div>
      <div className="mt-1 text-[10px] text-fg-subtle">{source}</div>
    </div>
  );
}

const SUPPLY_RISK_TONE: Record<string, 'positive' | 'neutral' | 'warning'> = {
  low: 'positive',
  medium: 'neutral',
  high: 'warning',
};

function DldSignals({ rec }: { rec: AdvisorRecommendation }) {
  const hasAny =
    rec.gross_yield_pct != null
    || rec.rent_growth_yoy_pct != null
    || rec.appreciation_5y_pct != null
    || rec.supply_risk != null;

  if (!hasAny) {
    return (
      <div className="rounded-md border border-border/60 bg-bg-elev/30 px-3 py-2 text-[11px] text-fg-subtle">
        No DLD overlay for this area yet — reasoning above falls back to the
        curated MarketSnapshot.
      </div>
    );
  }

  const year = rec.dld_year_latest ?? 2026;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium mb-2">
        Real DLD signals
        <span className="ml-2 normal-case text-fg-subtle">
          (Dubai Land Department, latest year {year})
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rec.gross_yield_pct != null && (
          <SignalTile
            label="Gross yield"
            value={formatPercent(rec.gross_yield_pct, 2)}
            source="DLD rent ÷ sale ppsf"
            tone={rec.gross_yield_pct >= 7 ? 'positive' : 'neutral'}
          />
        )}
        {rec.rent_growth_yoy_pct != null && (
          <SignalTile
            label="Rent growth YoY"
            value={`${rec.rent_growth_yoy_pct >= 0 ? '+' : ''}${rec.rent_growth_yoy_pct.toFixed(1)}%`}
            source="DLD Ejari contracts"
            tone={
              rec.rent_growth_yoy_pct >= 5
                ? 'positive'
                : rec.rent_growth_yoy_pct < 0
                  ? 'negative'
                  : 'neutral'
            }
          />
        )}
        {rec.cagr_5y_pct != null && rec.appreciation_5y_pct != null && (
          <SignalTile
            label="5y price growth"
            value={`+${rec.appreciation_5y_pct.toFixed(1)}%`}
            source={`CAGR ${rec.cagr_5y_pct >= 0 ? '+' : ''}${rec.cagr_5y_pct.toFixed(1)}% · DLD 2021→${year}`}
            tone={rec.cagr_5y_pct >= 8 ? 'positive' : 'neutral'}
          />
        )}
        {rec.supply_risk != null && (
          <SignalTile
            label="Supply risk"
            value={rec.supply_risk.toUpperCase()}
            source={
              rec.supply_risk_offplan_pct != null
                ? `${rec.supply_risk_offplan_pct.toFixed(0)}% off-plan in ${year}`
                : `DLD ${year} off-plan share`
            }
            tone={SUPPLY_RISK_TONE[rec.supply_risk]}
          />
        )}
      </div>
    </div>
  );
}
