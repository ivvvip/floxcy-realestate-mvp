'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MetricContent {
  what: string;
  for: string;
  good: string;
  tip: string;
}

const METRICS: Record<string, MetricContent> = {
  'Gross Yield': {
    what: 'Annual rental income ÷ property price',
    for: 'Income investors seeking cash flow',
    good: '>7% excellent | 5-7% good | <5% low',
    tip: 'Higher yield = better monthly income',
  },
  '5Y Appreciation': {
    what: 'Price growth over 5 years',
    for: 'Growth investors building wealth',
    good: '>100% excellent | 50-100% good',
    tip: 'Best for long-term buy-and-hold',
  },
  'Rent Growth YoY': {
    what: 'How much rents increased vs last year',
    for: 'Landlords & yield-focused investors',
    good: '>10% hot market | 5-10% healthy',
    tip: 'Rising rents = yield improving over time',
  },
  'Supply Risk': {
    what: 'Number of new projects in this area',
    for: 'All investors',
    good: 'Low = stable | High = price pressure',
    tip: 'High supply can push prices/rents down',
  },
  'Transaction Volume': {
    what: 'Number of sales in this area',
    for: 'All investors',
    good: '>1,000 = liquid market',
    tip: 'Higher volume = easier to sell later',
  },
  'Off-Plan %': {
    what: 'Share of sales that are off-plan',
    for: 'Market analysts',
    good: '>70% = growth confidence',
    tip: 'Shows investor confidence in future',
  },
  'Payback Period': {
    what: 'Years to recover investment via rent',
    for: 'Buy vs rent decision',
    good: '<15y buy | 15-20y neutral | >20y rent',
    tip: 'Lower = buying makes more sense',
  },
  Freehold: {
    what: 'Foreign nationals can own this property',
    for: 'Non-UAE investors',
    good: 'Yes = you can own 100%',
    tip: 'Essential for overseas investors',
  },
  'Investor Visa': {
    what: 'Property qualifies for residency visa',
    for: 'Expats wanting UAE residency',
    good: 'Properties from AED 750K qualify',
    tip: '2-year or 10-year golden visa',
  },
  'RERA Verified': {
    what: 'Broker licensed by Dubai Land Dept',
    for: 'All buyers/renters',
    good: 'Always use RERA verified brokers',
    tip: 'Protects you legally in all deals',
  },
  'Confidence Level': {
    what: 'How many contracts this is based on',
    for: 'Data-conscious investors',
    good: '>100 high | 30-100 medium | <30 low',
    tip: 'More contracts = more reliable data',
  },
  'Building Income': {
    what: 'Total annual rent collected in building',
    for: 'Institutional & serious investors',
    good: 'Higher = more active rental market',
    tip: 'Unique to Floxcy — from DLD Ejari data',
  },
  'Occupancy Rate': {
    what: '% of tenants who renewed their lease',
    for: 'Landlords & building investors',
    good: '>60% stable | <40% high turnover',
    tip: 'Higher renewal = happier tenants',
  },
  'Net Yield': {
    what: 'Yield after service charges & costs',
    for: 'Serious investors calculating returns',
    good: '>6% excellent | 4-6% good',
    tip: 'More accurate than gross yield',
  },
};

export type MetricKey = keyof typeof METRICS;

interface Props {
  metric: MetricKey | string;
  value?: string;
  target?: string;
  className?: string;
  size?: 'sm' | 'md';
  side?: 'top' | 'bottom';
}

/**
 * Contextual info icon that reveals an explanatory tooltip on hover (desktop)
 * or tap (mobile). Hidden by default — visible on demand.
 *
 * Wire next to any metric label by passing the metric name from the METRICS
 * catalog. Unknown metric names render nothing (safe no-op).
 */
export function MetricTooltip({
  metric,
  value,
  target,
  className,
  size = 'sm',
  side = 'top',
}: Props) {
  const content = METRICS[metric];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Tap-elsewhere-to-hide for mobile.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  if (!content) return null;

  const iconSize = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const audience = target || content.for;

  return (
    <span
      ref={wrapRef}
      className={cn('relative inline-flex items-center align-middle', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`About ${metric}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'ml-1 inline-flex items-center justify-center rounded-full',
          'text-fg-subtle hover:text-fg-muted transition-colors',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        )}
      >
        <Info className={iconSize} strokeWidth={2} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2',
            'w-[280px] max-w-[80vw] rounded-md shadow-xl',
            'border border-border px-3 py-2.5',
            'text-[11px] leading-snug text-fg',
            'transition-opacity duration-150',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
          style={{ backgroundColor: '#1a1a2e' }}
        >
          <div className="font-semibold text-fg mb-1.5 flex items-baseline justify-between gap-2">
            <span className="truncate">{metric}</span>
            {value && (
              <span className="tabular text-accent font-mono shrink-0">{value}</span>
            )}
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-fg-subtle">What:</span>{' '}
              <span className="text-fg-muted">{content.what}</span>
            </div>
            <div>
              <span className="text-fg-subtle">For:</span>{' '}
              <span className="text-fg-muted">{audience}</span>
            </div>
            <div>
              <span className="text-fg-subtle">Good:</span>{' '}
              <span className="text-accent font-medium">{content.good}</span>
            </div>
            <div className="pt-1 mt-1 border-t border-border/50 text-fg-muted italic">
              {content.tip}
            </div>
          </div>
          {/* Pointer arrow */}
          <span
            aria-hidden
            className={cn(
              'absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-border',
              side === 'top'
                ? 'top-full -mt-1 border-r border-b'
                : 'bottom-full -mb-1 border-l border-t',
            )}
            style={{ backgroundColor: '#1a1a2e' }}
          />
        </span>
      )}
    </span>
  );
}
