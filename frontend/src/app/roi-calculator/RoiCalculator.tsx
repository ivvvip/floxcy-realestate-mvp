'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { calculateROI } from '@/lib/api';
import { formatAED, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ROICalculateResponse } from '@/lib/types';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  min?: number;
}

function Field({ id, label, hint, value, onChange, required, min }: FieldProps) {
  return (
    <label htmlFor={id} className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-fg-subtle">
          AED
        </span>
        <input
          id={id}
          name={id}
          type="number"
          inputMode="decimal"
          min={min ?? 0}
          step="any"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-12 w-full rounded-xl border border-border bg-bg-elev/60 pl-14 pr-4 text-base font-medium text-fg',
            'placeholder:text-fg-subtle outline-none transition-colors',
            'focus:border-accent/50 focus:bg-bg-elev focus:ring-2 focus:ring-accent/20'
          )}
          placeholder="0"
        />
      </div>
    </label>
  );
}

const DEFAULTS = {
  property_price: '1500000',
  annual_rent: '120000',
  service_charges: '12000',
  maintenance_cost: '5000',
  other_costs: '0',
};

export function RoiCalculator() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState<ROICalculateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof typeof DEFAULTS) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  function reset() {
    setForm(DEFAULTS);
    setResult(null);
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const propertyPrice = Number(form.property_price);
    const annualRent = Number(form.annual_rent);

    if (!Number.isFinite(propertyPrice) || propertyPrice <= 0) {
      setError('Property price must be greater than 0.');
      setLoading(false);
      return;
    }
    if (!Number.isFinite(annualRent) || annualRent <= 0) {
      setError('Annual rent must be greater than 0.');
      setLoading(false);
      return;
    }

    try {
      const res = await calculateROI({
        property_price: propertyPrice,
        annual_rent: annualRent,
        service_charges: Number(form.service_charges) || 0,
        maintenance_cost: Number(form.maintenance_cost) || 0,
        other_costs: Number(form.other_costs) || 0,
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not calculate ROI. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 pb-20 lg:grid-cols-5">
      <form
        onSubmit={onSubmit}
        className="surface-card p-7 lg:col-span-3"
        noValidate
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          Property inputs
        </h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            id="property_price"
            label="Property price"
            hint="Required"
            value={form.property_price}
            onChange={update('property_price')}
            required
            min={1}
          />
          <Field
            id="annual_rent"
            label="Annual rent"
            hint="Required"
            value={form.annual_rent}
            onChange={update('annual_rent')}
            required
            min={1}
          />
          <Field
            id="service_charges"
            label="Service charges"
            hint="Per year"
            value={form.service_charges}
            onChange={update('service_charges')}
          />
          <Field
            id="maintenance_cost"
            label="Maintenance"
            hint="Per year"
            value={form.maintenance_cost}
            onChange={update('maintenance_cost')}
          />
          <div className="sm:col-span-2">
            <Field
              id="other_costs"
              label="Other costs"
              hint="Per year — insurance, agent fees, etc."
              value={form.other_costs}
              onChange={update('other_costs')}
            />
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-warn/30 bg-warn-muted px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={reset}
            disabled={loading}
          >
            Reset
          </Button>
          <Button type="submit" loading={loading}>
            Calculate ROI
          </Button>
        </div>
      </form>

      <aside className="lg:col-span-2">
        <ResultPanel result={result} loading={loading} />
      </aside>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: 'default' | 'accent' | 'warn';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-bg-elev/50 p-4',
        tone === 'accent' && 'border-accent/30 bg-accent-muted',
        tone === 'warn' && 'border-warn/30 bg-warn-muted'
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tracking-tight',
          tone === 'accent' && 'text-accent',
          tone === 'warn' && 'text-warn',
          tone === 'default' && 'text-fg'
        )}
      >
        {value}
      </p>
      {helper && <p className="mt-1 text-xs text-fg-muted">{helper}</p>}
    </div>
  );
}

function ResultPanel({
  result,
  loading,
}: {
  result: ROICalculateResponse | null;
  loading: boolean;
}) {
  if (!result && !loading) {
    return (
      <div className="surface-card flex h-full min-h-[400px] flex-col items-center justify-center p-7 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-muted text-accent ring-1 ring-accent/20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6" y1="20" x2="6" y2="16" />
          </svg>
        </span>
        <h3 className="mt-4 text-lg font-semibold text-fg">Awaiting inputs</h3>
        <p className="mt-2 max-w-xs text-sm text-fg-muted">
          Fill in the form and hit <span className="font-medium text-fg">Calculate ROI</span> to
          see your investment metrics.
        </p>
      </div>
    );
  }

  if (loading && !result) {
    return (
      <div className="surface-card flex h-full min-h-[400px] flex-col items-center justify-center p-7 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-r-transparent" />
        <p className="mt-4 text-sm text-fg-muted">Crunching the numbers…</p>
      </div>
    );
  }

  const r = result!;
  const netTone: 'accent' | 'warn' | 'default' =
    r.net_yield >= 7 ? 'accent' : r.net_yield < 4 ? 'warn' : 'default';

  return (
    <div className="surface-card flex h-full flex-col p-7">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        Results
      </h2>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MetricCard
          label="Gross yield"
          value={formatPercent(r.gross_yield)}
          helper="Annual rent ÷ price"
        />
        <MetricCard
          label="Net yield"
          value={formatPercent(r.net_yield)}
          helper="After costs"
          tone={netTone}
        />
        <MetricCard
          label="Payback"
          value={
            r.payback_years != null
              ? `${r.payback_years.toFixed(1)} yrs`
              : '—'
          }
          helper="Years to recover"
        />
        <MetricCard
          label="Net income"
          value={formatAED(r.annual_net_income, { compact: true })}
          helper="Per year"
        />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-bg-elev/40 p-4 text-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
          Interpretation
        </p>
        <p className="mt-2 leading-relaxed text-fg">{r.interpretation}</p>
      </div>

      <dl className="mt-6 grid gap-3 border-t border-border pt-5 text-sm">
        <div className="flex justify-between">
          <dt className="text-fg-muted">Property price</dt>
          <dd className="font-medium text-fg">{formatAED(r.property_price)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-muted">Annual rent</dt>
          <dd className="font-medium text-fg">{formatAED(r.annual_rent)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-muted">Total annual costs</dt>
          <dd className="font-medium text-fg">{formatAED(r.total_costs)}</dd>
        </div>
      </dl>
    </div>
  );
}
