'use client';

import { useState } from 'react';
import { Wallet, Info } from 'lucide-react';
import { computeNetYield, serviceRateFor, VACANCY_DEFAULT_PCT } from '@/lib/netYield';

/**
 * True Returns (Net Yield) — gross is advertised, net is what actually hits the
 * account. Service charge defaults to the area estimate and is user-editable;
 * everything recalculates live. Honest "estimate / verify via Mollak" labeling.
 */
export function NetYieldBlock({
  grossYield,
  ppsf,
  defaultRate,
  isVilla = false,
  compact = false,
}: {
  grossYield: number | null | undefined;
  ppsf: number | null | undefined;
  defaultRate?: number | null;
  isVilla?: boolean;
  compact?: boolean;
}) {
  const initialRate = defaultRate ?? serviceRateFor(ppsf, isVilla);
  const [rate, setRate] = useState<number>(initialRate);

  if (grossYield == null || grossYield <= 0) return null;
  const r = computeNetYield(grossYield, ppsf, rate, VACANCY_DEFAULT_PCT);
  if (!r) return null;

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2">
        <Wallet className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
        <h2 className="text-sm font-semibold text-fg">True Returns — Net Yield</h2>
        <span className="ml-auto text-[10px] text-fg-subtle border border-border rounded px-1.5 py-0.5">estimate</span>
      </div>
      <div className="p-4 space-y-2 text-xs">
        <Row label="Gross yield" value={`${r.gross.toFixed(1)}%`} />
        <Row
          label={`− Service charge (est. AED ${rate}/sqft)`}
          value={`−${r.serviceDragPct.toFixed(1)}%`}
          tone="negative"
        />
        <Row
          label={`− Vacancy (${VACANCY_DEFAULT_PCT}%)`}
          value={`−${r.vacancyDragPct.toFixed(1)}%`}
          tone="negative"
        />
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="font-semibold text-fg">✅ Net yield</span>
          <span className="tabular text-lg font-semibold text-positive">{r.net.toFixed(1)}%</span>
        </div>
        <p className="text-[11px] text-fg-subtle">What actually hits your account after costs.</p>

        {/* Editable service charge */}
        <div className="pt-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-fg-muted inline-flex items-center gap-1">⚙️ Adjust service charge</span>
          <input
            type="number"
            min={0}
            max={120}
            value={rate}
            onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 bg-bg-elev/60 border border-border rounded-md px-2 py-1 text-xs text-fg tabular text-right focus:outline-none focus:border-accent/60"
          />
          <span className="text-[11px] text-fg-subtle">AED/sqft</span>
          {rate !== initialRate && (
            <button onClick={() => setRate(initialRate)} className="text-[11px] text-accent hover:underline">reset</button>
          )}
        </div>

        {!compact && (
          <p className="mt-1 text-[11px] text-fg-subtle italic flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" strokeWidth={2.5} />
            <span>
              Estimated — service charges vary by building. Verify exact figures via the
              DLD Service Charge Index / Mollak. Gross is advertised; net is your real
              return (typically 1.5–2.5 points lower).
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'negative' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className={`tabular font-medium ${tone === 'negative' ? 'text-negative' : 'text-fg'}`}>{value}</span>
    </div>
  );
}
