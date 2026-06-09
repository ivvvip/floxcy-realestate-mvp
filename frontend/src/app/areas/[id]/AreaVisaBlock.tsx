/**
 * Visa-eligibility block for /areas/[id] (STEP 1 badge + STEP 2 distribution).
 * Rendered only when we have enough residential sales for this area to quote a
 * distribution honestly.
 */
import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { VisaBadge } from '@/components/VisaBadge';
import { formatLargeAED } from '@/lib/format';
import type { VisaArea } from '@/lib/types';

export function AreaVisaBlock({ area }: { area: VisaArea | null }) {
  if (!area) return null;
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2">
        <BadgeCheck className="h-3.5 w-3.5 text-positive" strokeWidth={2.5} />
        <h2 className="text-sm font-semibold text-fg">Residence visa eligibility</h2>
        <Link href="/visa" className="ml-auto text-[11px] text-accent hover:underline">How it works →</Link>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <VisaBadge price={area.median_price} showBelow size="sm" />
          <span className="text-[11px] text-fg-muted">on the median sale ({formatLargeAED(area.median_price)})</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border border-border bg-bg-elev/30 p-3">
            <div className="text-xl tabular font-semibold text-accent">{area.pct_investor_visa}%</div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle mt-0.5">qualify for investor visa (≥750K)</div>
          </div>
          <div className="rounded-md border border-border bg-bg-elev/30 p-3">
            <div className="text-xl tabular font-semibold text-positive">{area.pct_golden_visa}%</div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle mt-0.5">qualify for Golden Visa (≥2M)</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-fg-subtle italic">
          Share of {area.sales.toLocaleString()} residential sales in this area. Indicative —
          verify current visa rules with DLD / ICP / GDRFA.
        </p>
      </div>
    </section>
  );
}
