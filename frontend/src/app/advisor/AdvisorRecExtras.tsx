'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight, BadgeCheck, Building2, Calculator, ChevronDown, Database,
  Info, Loader2, MapPin, Sparkles, TrendingUp,
} from 'lucide-react';
import { getMarketTiming } from '@/lib/api';
import { formatAED, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AdvisorRecommendation, MarketTimingResponse } from '@/lib/types';

const VISA_THRESHOLD_AED = 750_000;

// ===========================================================================
// Market timing badge — fetches on demand the first time a rec expands
// ===========================================================================

// Module-level cache so multiple expansions of the same area don't refetch.
const TIMING_CACHE = new Map<string, MarketTimingResponse | 'failed'>();

export function MarketTimingBadge({ areaName }: { areaName: string }) {
  const [data, setData] = useState<MarketTimingResponse | 'loading' | 'failed' | null>(
    () => {
      const cached = TIMING_CACHE.get(areaName);
      return cached === undefined ? null : cached;
    },
  );

  useEffect(() => {
    if (data !== null) return;
    const cached = TIMING_CACHE.get(areaName);
    if (cached !== undefined) {
      setData(cached);
      return;
    }
    setData('loading');
    let cancelled = false;
    getMarketTiming(areaName)
      .then((r) => {
        if (cancelled) return;
        TIMING_CACHE.set(areaName, r);
        setData(r);
      })
      .catch(() => {
        if (cancelled) return;
        TIMING_CACHE.set(areaName, 'failed');
        setData('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [areaName, data]);

  if (data === 'loading' || data === null) {
    return (
      <span className="pill text-[10px] inline-flex items-center gap-1 text-fg-subtle">
        <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={2.5} />
        timing
      </span>
    );
  }
  if (data === 'failed') {
    return (
      <span className="pill text-[10px] text-fg-subtle">timing unavailable</span>
    );
  }
  const { verdict, confidence, headline, signals } = data;
  const dot = verdict === 'good_time' ? '🟢' : verdict === 'caution' ? '🔴' : '🟡';
  const phrase =
    verdict === 'good_time' ? 'Good time to buy' :
    verdict === 'caution'   ? 'Wait / caution' :
    'Neutral';
  const toneCls =
    verdict === 'good_time' ? 'border-positive/30 bg-positive/10 text-positive' :
    verdict === 'caution'   ? 'border-warning/30 bg-warning/10 text-warning' :
    'border-border bg-bg-elev text-fg-muted';

  return (
    <div className="rounded-md border border-border bg-bg-elev/20 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 tabular', toneCls)}>
          {dot} {phrase}
        </span>
        <span className="text-[10px] text-fg-subtle">{confidence} confidence</span>
      </div>
      <p className="text-[11px] text-fg leading-snug">{headline}</p>
      {signals.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-fg-muted">
          {signals.map((s) => (
            <li key={s.label} className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'shrink-0',
                  s.tone === 'positive' ? 'text-positive' :
                  s.tone === 'negative' ? 'text-warning' :
                  'text-fg-subtle'
                )}
              >•</span>
              <span className="text-fg-subtle w-24 shrink-0 capitalize">
                {s.label.replace(/_/g, ' ')}
              </span>
              <span className="text-fg">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Investor visa badge — flat 750K threshold
// ===========================================================================

export function InvestorVisaBadge({ entryPriceAed }: { entryPriceAed: number }) {
  const qualifies = entryPriceAed >= VISA_THRESHOLD_AED;
  if (!qualifies) {
    return (
      <span
        className="pill text-[10px] inline-flex items-center gap-1 border-border text-fg-subtle"
        title="Entry price below the AED 750K Investor Visa threshold"
      >
        Visa: below 750K threshold
      </span>
    );
  }
  return (
    <span
      className="pill text-[10px] inline-flex items-center gap-1 border-accent/30 bg-accent/10 text-accent"
      title="Investor Visa eligibility starts at AED 750K freehold purchase. Property must be freehold and fully paid (or mortgage approved)."
    >
      <BadgeCheck className="h-2.5 w-2.5" strokeWidth={2.5} />
      Qualifies for Investor Visa
    </span>
  );
}

// ===========================================================================
// DLD data panel — sample counts + confidence per recommendation
// ===========================================================================

interface DataConfidenceProps {
  rec: AdvisorRecommendation;
}

export function DataConfidencePanel({ rec }: DataConfidenceProps) {
  // The advisor schema doesn't carry sample counts directly today, but the
  // /opportunities-filtered schema does — for now we surface what we have
  // from the recommendation itself + DLD-source attribution per signal.
  const hasGross = rec.gross_yield_pct != null;
  const hasRentGrowth = rec.rent_growth_yoy_pct != null;
  const has5y = rec.appreciation_5y_pct != null;
  const hasSupply = rec.supply_risk != null;
  const dldSignalCount = [hasGross, hasRentGrowth, has5y, hasSupply].filter(Boolean).length;
  const confidence =
    dldSignalCount >= 3 ? 'High' :
    dldSignalCount >= 1 ? 'Medium' :
    'Low';
  const year = rec.dld_year_latest ?? 2026;
  return (
    <details className="rounded-md border border-border bg-bg-elev/10 p-3">
      <summary className="cursor-pointer text-xs font-medium text-fg inline-flex items-center gap-1.5">
        <Database className="h-3 w-3 text-accent" strokeWidth={2.5} />
        Data behind this recommendation
        <span className={cn(
          'pill text-[10px] ml-1',
          confidence === 'High' ? 'pill-positive' :
          confidence === 'Low' ? 'pill-negative' :
          ''
        )}>
          {confidence} confidence
        </span>
        <ChevronDown className="h-3 w-3 text-fg-subtle ml-auto" strokeWidth={2.5} />
      </summary>
      <ul className="mt-2 space-y-1 text-[11px] text-fg-muted">
        {hasGross && (
          <li>
            ✓ Gross yield {rec.gross_yield_pct!.toFixed(2)}% — DLD 2026 YTD
            (sales + Ejari rent contracts)
          </li>
        )}
        {hasRentGrowth && (
          <li>
            ✓ Rent growth YoY {rec.rent_growth_yoy_pct! >= 0 ? '+' : ''}
            {rec.rent_growth_yoy_pct!.toFixed(1)}% — DLD Ejari 2025→{year}
          </li>
        )}
        {has5y && rec.cagr_5y_pct != null && (
          <li>
            ✓ Price history 2021→{year} (CAGR {rec.cagr_5y_pct.toFixed(1)}%)
          </li>
        )}
        {hasSupply && (
          <li>
            ✓ Supply pressure: <span className="capitalize">{rec.supply_risk}</span>
            {rec.supply_risk_offplan_pct != null
              ? ` (${rec.supply_risk_offplan_pct.toFixed(0)}% off-plan in ${year})`
              : ''}
          </li>
        )}
        {dldSignalCount === 0 && (
          <li className="text-fg-subtle italic">
            No DLD overlay for this area yet — reasoning falls back to curated
            MarketSnapshot, which is rougher than live DLD data.
          </li>
        )}
      </ul>
    </details>
  );
}

// ===========================================================================
// What-if scenarios — client-side recalculation from the rec metrics
// ===========================================================================

export function WhatIfPanel({
  rec, budgetAed,
}: {
  rec: AdvisorRecommendation;
  budgetAed: number;
}) {
  const yieldPct = rec.gross_yield_pct ?? rec.rental_yield;
  const baseRent = budgetAed * (yieldPct / 100);
  const rentPlus10 = baseRent * 1.10;
  const yieldPlus10 = yieldPct * 1.10;

  const cagr = rec.cagr_5y_pct ?? rec.appreciation_1y ?? 8;
  const price1y = budgetAed * (1 + cagr / 100);
  const priceUplift1y = price1y - budgetAed;

  // Rough mortgage delta for +1pp on a typical 80% LTV / 25y note
  // ΔPMT ≈ loan * Δrate / 12 over the first years of an amortising loan;
  // we use the annualised first-year-interest approximation which is
  // accurate to within ~5% and clearly disclosed below.
  const loan = budgetAed * 0.80;
  const ratePlus1pp = (loan * 0.01); // approx first-year extra interest

  return (
    <details className="rounded-md border border-border bg-bg-elev/10 p-3">
      <summary className="cursor-pointer text-xs font-medium text-fg inline-flex items-center gap-1.5">
        <Calculator className="h-3 w-3 text-accent" strokeWidth={2.5} />
        What-if scenarios
        <ChevronDown className="h-3 w-3 text-fg-subtle ml-auto" strokeWidth={2.5} />
      </summary>
      <div className="mt-2 grid sm:grid-cols-3 gap-2 text-[11px]">
        <WhatIfCard
          label="If rent +10%"
          headline={`${formatAED(rentPlus10, { compact: true })}/y`}
          sub={`${yieldPlus10.toFixed(2)}% gross yield  (was ${yieldPct.toFixed(2)}%)`}
        />
        <WhatIfCard
          label="If you wait 1 year"
          headline={`${formatAED(price1y, { compact: true })}`}
          sub={`+${formatAED(priceUplift1y, { compact: true })} entry cost (CAGR ${cagr.toFixed(1)}%)`}
        />
        <WhatIfCard
          label="If rates +1pp"
          headline={`+${formatAED(ratePlus1pp, { compact: true })}/y`}
          sub={`extra mortgage interest (80% LTV, 1st-yr approx)`}
        />
      </div>
      <p className="mt-2 text-[10px] text-fg-subtle italic">
        Heuristic, not full ROI. For a complete model use the{' '}
        <Link href={`/roi-calculator`} className="text-accent hover:underline">
          ROI calculator
        </Link>
        .
      </p>
    </details>
  );
}

function WhatIfCard({
  label, headline, sub,
}: { label: string; headline: string; sub: string }) {
  return (
    <div className="border border-border rounded-md bg-bg p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular text-fg">{headline}</div>
      <div className="mt-0.5 text-[10px] text-fg-muted leading-snug">{sub}</div>
    </div>
  );
}

// ===========================================================================
// Best building link — opens /buildings filtered to the area
// ===========================================================================

export function BestBuildingLink({ areaName }: { areaName: string }) {
  return (
    <Link
      href={`/buildings?area=${encodeURIComponent(areaName)}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
    >
      <Building2 className="h-3 w-3" strokeWidth={2.5} />
      Best buildings in {areaName}
      <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
    </Link>
  );
}

// ===========================================================================
// Follow-up question chips — fill the existing question textarea + submit
// ===========================================================================

export function FollowupChips({
  recommendations, onAsk,
}: {
  recommendations: { area_name: string }[];
  onAsk: (question: string) => void;
}) {
  // Build per-recommendation chips so they're contextual to the user's picks
  const top = recommendations[0]?.area_name;
  const second = recommendations[1]?.area_name;
  const chips = [
    top ? `Tell me more about ${top}` : null,
    top ? `Best building in ${top}?` : null,
    top && second ? `Compare ${top} vs ${second}` : null,
    'Is now a good time to buy?',
    'What about off-plan?',
    'Show me cheaper options',
    top ? `What's the risk in ${top}?` : null,
  ].filter((c): c is string => Boolean(c));

  if (chips.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium mb-2 inline-flex items-center gap-1">
        <Sparkles className="h-2.5 w-2.5 text-accent" strokeWidth={2.5} />
        Follow-up questions
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onAsk(c)}
            className="rounded-full border border-border bg-bg-elev/40 px-3 py-1 text-[11px] text-fg-muted hover:text-fg hover:border-accent/40"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// Suppress unused warnings — kept for future enhancements
void Info; void MapPin; void TrendingUp; void formatNumber;
