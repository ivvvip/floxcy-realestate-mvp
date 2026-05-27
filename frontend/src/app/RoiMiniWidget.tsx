'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatPercent, formatNumber } from '@/lib/format';

export function RoiMiniWidget() {
  const [price, setPrice] = useState(1_500_000);
  const [rent, setRent] = useState(90_000);
  const [costs, setCosts] = useState(8_000);

  const { grossYield, netYield, payback } = useMemo(() => {
    if (price <= 0) return { grossYield: 0, netYield: 0, payback: 0 };
    const net = rent - costs;
    return {
      grossYield: (rent / price) * 100,
      netYield: (net / price) * 100,
      payback: net > 0 ? price / net : 0,
    };
  }, [price, rent, costs]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-7 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-border">
        <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
          Quick ROI estimator
        </div>
        <h3 className="mt-2 text-xl font-semibold text-fg">
          Model an investment in 30 seconds
        </h3>
        <p className="mt-1.5 text-sm text-fg-muted">
          Live calculation. No sign-up. Open the full calculator for advanced cost breakdown.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Property price"
            suffix="AED"
            value={price}
            onChange={setPrice}
            step={50_000}
          />
          <Field
            label="Annual rent"
            suffix="AED"
            value={rent}
            onChange={setRent}
            step={1_000}
          />
          <Field
            label="Annual costs"
            suffix="AED"
            value={costs}
            onChange={setCosts}
            step={500}
          />
        </div>
      </div>
      <div className="lg:col-span-5 grid grid-cols-3 lg:grid-cols-1 lg:grid-rows-3 divide-x lg:divide-x-0 lg:divide-y divide-border">
        <Stat label="Gross yield" value={formatPercent(grossYield, 2)} />
        <Stat label="Net yield" value={formatPercent(netYield, 2)} accent={netYield > 6} negative={netYield < 0} />
        <Stat
          label="Payback"
          value={payback > 0 ? `${formatNumber(payback, 1)} yrs` : '—'}
        />
      </div>
      <div className="lg:col-span-12 border-t border-border px-6 py-3 flex items-center justify-between">
        <span className="text-xs text-fg-subtle">
          Estimates exclude financing, taxes, and one-time fees.
        </span>
        <Link
          href="/roi-calculator"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
        >
          Open full calculator
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </span>
      <div className="mt-1 relative">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="input-field pr-12"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-fg-subtle">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function Stat({
  label,
  value,
  accent,
  negative,
}: {
  label: string;
  value: string;
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div
        className={`mt-1.5 text-xl tabular ${
          negative ? 'text-negative' : accent ? 'text-positive' : 'text-fg'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
