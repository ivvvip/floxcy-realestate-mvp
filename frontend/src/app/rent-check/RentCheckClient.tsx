'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { dldRentCheck } from '@/lib/api';
import { formatAED, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RentCheckResponse } from '@/lib/types';

const PROP_TYPES = ['Flat', 'Villa', 'Hotel Apartment'] as const;

const DEFAULTS = {
  area_name: 'Al Barsha First',
  size_sqm: '90',
  annual_rent: '75000',
  prop_sub_type: 'Flat' as (typeof PROP_TYPES)[number],
};

const VERDICT_COPY: Record<
  RentCheckResponse['verdict'],
  { label: string; tone: 'positive' | 'negative' | 'warning' }
> = {
  fair: { label: 'Fair', tone: 'positive' },
  above_market: { label: 'Above market', tone: 'negative' },
  below_market: { label: 'Below market', tone: 'warning' },
};

const CONFIDENCE_COPY: Record<
  RentCheckResponse['confidence'],
  { label: string; hint: string }
> = {
  high: { label: 'High confidence', hint: '≥100 comparable rent contracts' },
  medium: { label: 'Medium confidence', hint: '30–99 comparable rent contracts' },
  low: { label: 'Low confidence', hint: '<30 comparable rent contracts' },
};

export function RentCheckClient() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState<RentCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof DEFAULTS>(key: K) {
    return (v: (typeof DEFAULTS)[K]) => setForm((f) => ({ ...f, [key]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const size = Number(form.size_sqm);
    const rent = Number(form.annual_rent);
    if (!form.area_name.trim() || form.area_name.trim().length < 2) {
      setError('Enter the area name.');
      return;
    }
    if (!Number.isFinite(size) || size <= 0) {
      setError('Size (sqm) must be greater than 0.');
      return;
    }
    if (!Number.isFinite(rent) || rent <= 0) {
      setError('Annual rent must be greater than 0.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await dldRentCheck({
        area_name: form.area_name.trim(),
        size_sqm: size,
        annual_rent: rent,
        prop_sub_type: form.prop_sub_type,
      });
      setResult(res);
    } catch (err) {
      const msg =
        err instanceof Error && 'body' in err
          ? // @ts-expect-error ApiError shape
            err.body?.detail ?? err.message
          : err instanceof Error
            ? err.message
            : 'Could not run rent check. Please try again.';
      setError(String(msg));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Form */}
      <form
        onSubmit={onSubmit}
        className="card p-5 h-fit space-y-4"
        aria-labelledby="rent-check-form"
      >
        <h2 id="rent-check-form" className="text-sm font-semibold text-fg">
          Your rental
        </h2>

        <div>
          <label
            htmlFor="area_name"
            className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Area
          </label>
          <input
            id="area_name"
            type="text"
            value={form.area_name}
            onChange={(e) => update('area_name')(e.target.value)}
            placeholder="e.g. Al Barsha First, Business Bay"
            className="input-field mt-1"
            required
          />
          <p className="mt-1 text-[11px] text-fg-subtle">
            Use the official DLD area name (case insensitive).
          </p>
        </div>

        <div>
          <label
            htmlFor="prop_sub_type"
            className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Property type
          </label>
          <select
            id="prop_sub_type"
            value={form.prop_sub_type}
            onChange={(e) =>
              update('prop_sub_type')(
                e.target.value as (typeof PROP_TYPES)[number]
              )
            }
            className="input-field mt-1"
          >
            {PROP_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="size_sqm"
              className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium"
            >
              Size (sqm)
            </label>
            <input
              id="size_sqm"
              type="number"
              inputMode="decimal"
              min={1}
              step="any"
              value={form.size_sqm}
              onChange={(e) => update('size_sqm')(e.target.value)}
              className="input-field mt-1"
              required
            />
          </div>
          <div>
            <label
              htmlFor="annual_rent"
              className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium"
            >
              Annual rent
            </label>
            <div className="relative mt-1">
              <input
                id="annual_rent"
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                value={form.annual_rent}
                onChange={(e) => update('annual_rent')(e.target.value)}
                className="input-field pr-12"
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-fg-subtle">
                AED
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          {loading ? 'Checking…' : 'Check my rent'}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </form>

      {/* Result */}
      <div className="space-y-4">
        {!result && !loading && !error && (
          <div className="card p-8 text-center text-sm text-fg-subtle">
            Enter your rental details to compare against the Dubai Land
            Department benchmark for your area, property type and size band.
          </div>
        )}

        {result && <RentCheckResult result={result} />}
      </div>
    </div>
  );
}

function RentCheckResult({ result }: { result: RentCheckResponse }) {
  const v = VERDICT_COPY[result.verdict];
  const conf = CONFIDENCE_COPY[result.confidence];
  const verdictIcon =
    result.verdict === 'fair' ? (
      <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
    ) : (
      <AlertTriangle className="h-5 w-5" strokeWidth={2} />
    );

  const pct = Math.min(100, Math.max(0, result.percentile));

  return (
    <>
      {/* Headline verdict */}
      <div
        className={cn(
          'card p-5 flex items-start gap-4',
          v.tone === 'positive' && 'border-positive/40',
          v.tone === 'negative' && 'border-negative/40',
          v.tone === 'warning' && 'border-warning/40'
        )}
      >
        <div
          className={cn(
            'mt-0.5',
            v.tone === 'positive' && 'text-positive',
            v.tone === 'negative' && 'text-negative',
            v.tone === 'warning' && 'text-warning'
          )}
        >
          {verdictIcon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-base font-semibold',
                v.tone === 'positive' && 'text-positive',
                v.tone === 'negative' && 'text-negative',
                v.tone === 'warning' && 'text-warning'
              )}
            >
              {v.label}
            </span>
            <span className="text-[11px] text-fg-subtle">
              · {result.percentage_diff >= 0 ? '+' : ''}
              {result.percentage_diff.toFixed(1)}% vs area median
            </span>
          </div>
          <p className="mt-1 text-sm text-fg">
            Your annual rent of{' '}
            <span className="font-mono">{formatAED(result.user_rent)}</span>{' '}
            sits at the{' '}
            <span className="font-mono">{result.percentile.toFixed(0)}th</span>{' '}
            percentile of comparable contracts (median{' '}
            <span className="font-mono">{formatAED(result.area_median)}</span>,
            size band <span className="font-mono">{result.size_band} sqm</span>).
          </p>

          {/* Percentile bar */}
          <div className="mt-3">
            <div className="relative h-2 rounded-full bg-bg-elev overflow-hidden">
              <div
                className={cn(
                  'absolute inset-y-0 left-0',
                  v.tone === 'positive' && 'bg-positive/70',
                  v.tone === 'negative' && 'bg-negative/70',
                  v.tone === 'warning' && 'bg-warning/70'
                )}
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg"
                style={{ left: '50%' }}
                aria-hidden
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
              <span>cheapest 10%</span>
              <span>median</span>
              <span>priciest 10%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="card flex flex-wrap divide-x divide-border">
        <Stat label="Sample size" value={result.sample_size.toLocaleString()} hint={conf.label} />
        <Stat
          label="YoY rent trend"
          value={
            result.yoy_trend == null
              ? '—'
              : `${result.yoy_trend >= 0 ? '+' : ''}${result.yoy_trend.toFixed(1)}%`
          }
          icon={
            result.yoy_trend == null ? null : result.yoy_trend >= 0 ? (
              <TrendingUp className="h-3 w-3 text-positive" strokeWidth={2.5} />
            ) : (
              <TrendingDown className="h-3 w-3 text-negative" strokeWidth={2.5} />
            )
          }
          hint="vs 2025"
        />
        <Stat label="Confidence" value={conf.label} hint={conf.hint} />
        <Stat label="Size band" value={`${result.size_band} sqm`} hint="DLD bucket" />
      </div>

      {/* Suggested cheaper alternatives */}
      {result.suggested_areas.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-fg">
            Cheaper alternatives — same property type and size band
          </h3>
          <p className="mt-1 text-[11px] text-fg-subtle">
            Lower-median areas with at least one comparable contract band. Tap
            to explore.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {result.suggested_areas.map((s) => (
              <div
                key={s.area_name}
                className="rounded border border-border bg-bg-elev px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-fg truncate">
                    {s.area_name}
                  </span>
                  <span className="text-[11px] font-mono text-positive">
                    −{s.saving_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-fg-subtle">
                  Median{' '}
                  <span className="font-mono text-fg">
                    {formatAED(s.median_annual_rent)}
                  </span>{' '}
                  · {s.sample_size} contracts
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-fg-subtle">
        Source: {result.data_source}. Benchmark last updated{' '}
        {result.last_updated}. Verdict bands: rent below DLD p25 → below market,
        between p25 and p75 → fair, above p75 → above market.
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[150px] px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className="mt-1.5 text-lg leading-tight text-fg flex items-center gap-1.5 tabular">
        {icon}
        <span>{value}</span>
      </div>
      {hint && <div className="mt-1 text-[11px] text-fg-subtle">{hint}</div>}
    </div>
  );
}
