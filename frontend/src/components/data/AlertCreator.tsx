'use client';

import { useState } from 'react';
import { BellPlus } from 'lucide-react';
import { createAlert } from '@/lib/api';
import type { AlertType } from '@/lib/types';

interface AlertCreatorProps {
  area?: { id: string; name: string };
  defaultType?: AlertType;
  defaultThreshold?: number;
  onCreated?: () => void;
  compact?: boolean;
}

const TYPE_OPTIONS: { value: AlertType; label: string; paramKey?: string; paramSuffix?: string }[] = [
  { value: 'yield_above', label: 'Yield rises above', paramKey: 'threshold', paramSuffix: '%' },
  { value: 'yield_below', label: 'Yield falls below', paramKey: 'threshold', paramSuffix: '%' },
  { value: 'price_below', label: 'Price/sqft drops below', paramKey: 'threshold', paramSuffix: 'AED' },
  { value: 'price_above', label: 'Price/sqft rises above', paramKey: 'threshold', paramSuffix: 'AED' },
  { value: 'volume_spike', label: 'Transaction volume jumps by', paramKey: 'pct_change', paramSuffix: '%' },
  { value: 'undervalued_appears', label: 'Becomes strong undervalued' },
  { value: 'opportunity_appears', label: 'New strong opportunity (any area)' },
];

export function AlertCreator({
  area,
  defaultType = 'yield_above',
  defaultThreshold = 8,
  onCreated,
  compact = false,
}: AlertCreatorProps) {
  const [type, setType] = useState<AlertType>(defaultType);
  const [threshold, setThreshold] = useState<number>(defaultThreshold);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const def = TYPE_OPTIONS.find((o) => o.value === type)!;

  async function submit() {
    setLoading(true);
    setStatus(null);
    try {
      const params: Record<string, unknown> = {};
      if (def.paramKey) params[def.paramKey] = threshold;
      await createAlert({
        type,
        area_id: area?.id,
        params,
        delivery: 'in_app',
      });
      setStatus({ kind: 'ok', msg: 'Alert created.' });
      onCreated?.();
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof Error ? e.message : 'Failed to create alert',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? '' : 'border border-border rounded-lg bg-bg-card'}>
      {!compact && (
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <BellPlus className="h-3.5 w-3.5" strokeWidth={2} />
            Create alert
            {area && (
              <span className="text-fg-muted normal-case font-normal">
                · {area.name}
              </span>
            )}
          </span>
        </div>
      )}
      <div className={compact ? 'flex flex-wrap items-end gap-2' : 'p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end'}>
        <div>
          {!compact && (
            <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Condition
            </label>
          )}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AlertType)}
            className="input-field mt-1"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {def.paramKey && (
          <div>
            {!compact && (
              <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Threshold ({def.paramSuffix})
              </label>
            )}
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              step="0.1"
              className="input-field mt-1"
            />
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BellPlus className="h-3.5 w-3.5" strokeWidth={2} />
          {loading ? 'Saving…' : 'Set alert'}
        </button>
      </div>
      {status && (
        <div
          className={
            compact
              ? `mt-2 text-[11px] tabular ${status.kind === 'ok' ? 'text-positive' : 'text-negative'}`
              : `px-4 pb-4 text-[11px] tabular ${status.kind === 'ok' ? 'text-positive' : 'text-negative'}`
          }
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
