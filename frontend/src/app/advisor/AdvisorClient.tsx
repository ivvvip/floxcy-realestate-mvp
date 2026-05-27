'use client';

import Link from 'next/link';
import { useState } from 'react';
import { advisorQuery } from '@/lib/api';
import type {
  AdvisorGoal,
  AdvisorQueryResponse,
  AdvisorRisk,
} from '@/lib/types';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const GOALS: { value: AdvisorGoal; label: string; hint: string }[] = [
  { value: 'yield', label: 'Cash flow', hint: 'Maximize rental yield' },
  { value: 'appreciation', label: 'Appreciation', hint: 'Long-term capital growth' },
  { value: 'balanced', label: 'Balanced', hint: 'Mix of both' },
];

const RISKS: { value: AdvisorRisk; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'Established, blue-chip' },
  { value: 'med', label: 'Medium', hint: 'Mainstream picks' },
  { value: 'high', label: 'High', hint: 'Emerging, higher upside' },
];

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000];

export function AdvisorClient() {
  const [budget, setBudget] = useState(1_500_000);
  const [goal, setGoal] = useState<AdvisorGoal>('balanced');
  const [risk, setRisk] = useState<AdvisorRisk>('med');
  const [result, setResult] = useState<AdvisorQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await advisorQuery({ budget_aed: budget, goal, risk });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,1.5fr]">
      <form onSubmit={submit} className="surface-card space-y-6 p-6 h-fit">
        <div>
          <label className="text-sm font-medium text-fg-muted">
            Investment budget (AED)
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={300_000}
              max={10_000_000}
              step={50_000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <div className="w-32 text-right font-mono text-lg text-fg">
              {formatAED(budget, { compact: true })}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setBudget(p)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  budget === p
                    ? 'border-accent bg-accent-muted text-accent'
                    : 'border-border bg-bg-elev text-fg-muted hover:text-fg'
                )}
              >
                {formatAED(p, { compact: true })}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-fg-muted">
            Primary goal
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {GOALS.map((g) => (
              <label
                key={g.value}
                className={cn(
                  'cursor-pointer rounded-xl border p-3 transition-colors',
                  goal === g.value
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-bg-elev hover:border-border-strong'
                )}
              >
                <input
                  type="radio"
                  name="goal"
                  value={g.value}
                  checked={goal === g.value}
                  onChange={() => setGoal(g.value)}
                  className="sr-only"
                />
                <div className="text-sm font-medium text-fg">{g.label}</div>
                <div className="mt-0.5 text-xs text-fg-muted">{g.hint}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-fg-muted">
            Risk tolerance
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {RISKS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'cursor-pointer rounded-xl border p-3 transition-colors',
                  risk === r.value
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-bg-elev hover:border-border-strong'
                )}
              >
                <input
                  type="radio"
                  name="risk"
                  value={r.value}
                  checked={risk === r.value}
                  onChange={() => setRisk(r.value)}
                  className="sr-only"
                />
                <div className="text-sm font-medium text-fg">{r.label}</div>
                <div className="mt-0.5 text-xs text-fg-muted">{r.hint}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Analyzing market data…' : 'Get recommendations'}
        </button>

        {error && (
          <p className="text-sm text-warn">Something went wrong: {error}</p>
        )}
      </form>

      <div className="space-y-4">
        {!result && (
          <div className="surface-card p-8 text-center">
            <h3 className="text-lg font-semibold text-fg">
              Ready when you are
            </h3>
            <p className="mt-2 text-sm text-fg-muted">
              Fill in your preferences and we&apos;ll rank the top 3 Dubai areas
              for your profile.
            </p>
          </div>
        )}
        {result?.recommendations.map((r) => (
          <div key={r.area_id} className="surface-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">
                    {r.rank}
                  </span>
                  <h3 className="text-xl font-semibold text-fg">
                    {r.area_name}
                  </h3>
                </div>
                {r.area_name_arabic && (
                  <p className="mt-1 text-sm text-fg-muted" dir="rtl">
                    {r.area_name_arabic}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-fg-subtle">
                  Match score
                </div>
                <div className="text-2xl font-semibold text-accent">
                  {r.score.toFixed(0)}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Price/sqft" value={formatAED(r.avg_price_per_sqft)} />
              <Stat label="Yield" value={formatPercent(r.rental_yield)} />
              <Stat
                label="1y Apprec."
                value={formatPercent(r.appreciation_1y ?? 0)}
              />
              <Stat
                label="Affordable sqft"
                value={formatNumber(r.estimated_affordable_sqft)}
              />
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
              {r.reasoning.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/areas/${r.area_id}`}
              className="mt-5 inline-flex h-9 items-center rounded-lg border border-border bg-bg-elev px-3 text-sm font-medium text-fg hover:border-border-strong"
            >
              View area details →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev/50 p-3">
      <div className="text-xs uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-fg">{value}</div>
    </div>
  );
}
