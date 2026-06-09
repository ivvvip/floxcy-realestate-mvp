'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatLargeAED } from '@/lib/format';
import { visaTier, INVESTOR_VISA_AED, GOLDEN_VISA_AED } from '@/lib/visa';
import { toAreaSlug } from '@/lib/slugs';
import type { VisaArea } from '@/lib/types';

export function VisaChecker({ areas }: { areas: VisaArea[] }) {
  const [budget, setBudget] = useState<string>('');
  const b = Number(budget.replace(/[^\d]/g, '')) || 0;
  const tier = visaTier(b || null);

  const options = useMemo(() => {
    if (!b) return [];
    // Areas you can realistically buy in at this budget (median ≤ budget),
    // prioritising those that actually have stock at your visa tier.
    const affordable = areas.filter((a) => a.median_price <= b);
    const key = b >= GOLDEN_VISA_AED ? 'pct_golden_visa' : 'pct_investor_visa';
    return [...affordable]
      .sort((x, y) => (y[key as 'pct_golden_visa'] - x[key as 'pct_golden_visa']) || (x.median_price - y.median_price))
      .slice(0, 8);
  }, [areas, b]);

  return (
    <div className="surface-card p-4">
      <label className="block">
        <span className="text-xs font-medium text-fg">Your budget (AED)</span>
        <input
          inputMode="numeric"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="e.g. 2,000,000"
          className="mt-1 w-full bg-bg-elev/60 border border-border rounded-md px-3 py-2 text-sm text-fg tabular placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        />
      </label>

      {b > 0 && (
        <div className="mt-4 space-y-4">
          <div className={`rounded-lg border p-3 ${tier.className}`}>
            {tier.tier === 'golden' && (
              <div className="text-sm font-semibold">🟢 You qualify for the 10-year Golden Visa</div>
            )}
            {tier.tier === 'investor' && (
              <div className="text-sm font-semibold">🔵 You qualify for the 2-year investor visa</div>
            )}
            {tier.tier === 'none' && (
              <div className="text-sm font-semibold text-fg">Below the AED {INVESTOR_VISA_AED.toLocaleString()} visa threshold</div>
            )}
            <p className="mt-1 text-[11px] text-fg-muted">
              {tier.tier === 'investor' && `Add AED ${(GOLDEN_VISA_AED - b).toLocaleString()} to reach the AED 2M Golden Visa tier.`}
              {tier.tier === 'golden' && 'Buy a property of AED 2M+ to obtain the Golden Visa (mortgaged properties can qualify).'}
              {tier.tier === 'none' && `Reach AED ${INVESTOR_VISA_AED.toLocaleString()} for a 2-year visa, or AED 2M for the Golden Visa.`}
            </p>
          </div>

          {options.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle mb-1.5">
                Areas with options within your budget
              </div>
              <ul className="divide-y divide-border/60 border border-border rounded-lg overflow-hidden">
                {options.map((a) => (
                  <li key={a.name_norm}>
                    <Link
                      href={`/areas/${toAreaSlug(a.name_norm)}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-bg-elev/40"
                    >
                      <span className="text-fg font-medium truncate">{a.name}</span>
                      <span className="flex items-center gap-2 shrink-0 tabular text-fg-muted">
                        <span>median {formatLargeAED(a.median_price)}</span>
                        <span className="text-positive">{a.pct_golden_visa}% ≥2M</span>
                        <ArrowRight className="h-3 w-3 text-accent" strokeWidth={2.5} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
