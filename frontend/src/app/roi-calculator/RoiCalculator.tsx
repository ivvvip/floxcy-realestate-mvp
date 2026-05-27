'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { calculateROI } from '@/lib/api';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MetricTile } from '@/components/data/MetricTile';
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
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
          {label}
        </span>
        {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
      </div>
      <div className="relative mt-1">
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
          className="input-field pr-12"
          placeholder="0"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-fg-subtle">
          AED
        </span>
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(key: keyof typeof DEFAULTS) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  function reset() {
    setForm(DEFAULTS);
    setResult(null);
    setError(null);
  }

  async function runCalc() {
    const propertyPrice = Number(form.property_price);
    const annualRent = Number(form.annual_rent);
    if (!Number.isFinite(propertyPrice) || propertyPrice <= 0) {
      setError('Property price must be greater than 0.');
      return;
    }
    if (!Number.isFinite(annualRent) || annualRent <= 0) {
      setError('Annual rent must be greater than 0.');
      return;
    }
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runCalc();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    runCalc();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Form */}
      <form
        onSubmit={onSubmit}
        className="lg:col-span-5 border border-border rounded-lg bg-bg-card h-fit"
        noValidate
      >
        <div className="chart-header">
          <span className="chart-header-label">Property inputs</span>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-fg-muted hover:text-fg"
          >
            Reset
          </button>
        </div>
        <div className="p-5 space-y-4">
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
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="service_charges"
              label="Service charges"
              hint="/yr"
              value={form.service_charges}
              onChange={update('service_charges')}
            />
            <Field
              id="maintenance_cost"
              label="Maintenance"
              hint="/yr"
              value={form.maintenance_cost}
              onChange={update('maintenance_cost')}
            />
          </div>
          <Field
            id="other_costs"
            label="Other costs"
            hint="Insurance, agent, etc."
            value={form.other_costs}
            onChange={update('other_costs')}
          />

          {error && (
            <div className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
              {error}
            </div>
          )}

          <div className="text-[11px] text-fg-subtle">
            {loading ? 'Recalculating…' : 'Auto-updates on input change'}
          </div>
        </div>
      </form>

      {/* Results */}
      <div className="lg:col-span-7">
        {!result ? (
          <div className="border border-border rounded-lg bg-bg-card p-10 text-center min-h-[300px] flex flex-col items-center justify-center">
            <p className="text-sm text-fg-muted">
              Fill in inputs to see live yield, payback, and net income.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
              <div className="chart-header">
                <span className="chart-header-label">Computed metrics</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border">
                <MetricTile
                  label="Gross yield"
                  value={formatPercent(result.gross_yield, 2)}
                  mono
                  hint="Rent ÷ price"
                />
                <MetricTile
                  label="Net yield"
                  value={formatPercent(result.net_yield, 2)}
                  mono
                  hint="After costs"
                  tone={
                    result.net_yield >= 7
                      ? 'positive'
                      : result.net_yield < 4
                        ? 'negative'
                        : 'default'
                  }
                />
                <MetricTile
                  label="Payback"
                  value={
                    result.payback_years != null
                      ? `${result.payback_years.toFixed(1)} yrs`
                      : '—'
                  }
                  mono
                  hint="Years to recover"
                />
                <MetricTile
                  label="Annual net income"
                  value={formatAED(result.annual_net_income, { compact: true })}
                  mono
                  hint="Per year"
                />
              </div>
            </div>

            <div className="border border-border rounded-lg bg-bg-card p-5">
              <div className="chart-header-label">Interpretation</div>
              <p className="mt-2 text-sm leading-relaxed text-fg font-mono">
                {result.interpretation}
              </p>
            </div>

            <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
              <div className="chart-header">
                <span className="chart-header-label">Cash flow summary</span>
              </div>
              <table className="data-table">
                <tbody>
                  <Row
                    label="Property price"
                    value={formatAED(result.property_price)}
                  />
                  <Row
                    label="Annual rent (gross)"
                    value={formatAED(result.annual_rent)}
                  />
                  <Row
                    label="Total annual costs"
                    value={
                      <span className="text-negative">
                        −{formatNumber(result.total_costs, 0)}
                      </span>
                    }
                  />
                  <Row
                    label="Annual net income"
                    value={
                      <span
                        className={cn(
                          result.annual_net_income >= 0
                            ? 'text-positive'
                            : 'text-negative'
                        )}
                      >
                        {formatNumber(result.annual_net_income, 0)}
                      </span>
                    }
                    emphasize
                  />
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <tr>
      <td className={cn('text-fg-muted', emphasize && 'font-medium text-fg')}>
        {label}
      </td>
      <td className={cn('num', emphasize && 'font-medium')}>{value}</td>
    </tr>
  );
}
