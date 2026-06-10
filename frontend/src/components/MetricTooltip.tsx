'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MetricContent {
  what: string;
  for: string;
  good?: string;
  tip: string;
}

const METRICS: Record<string, MetricContent> = {
  'Gross yield': {
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
  'Net yield': {
    what: 'Yield after service charges & costs',
    for: 'Serious investors calculating returns',
    good: '>6% excellent | 4-6% good',
    tip: 'More accurate than gross yield',
  },

  // Dashboard KPI tile entries — Dubai-wide totals, not per-area metrics.
  'Sales YTD': {
    what: 'Total property sales registered Jan–May 2026',
    for: 'Investors tracking market activity',
    tip: 'Higher volume = more liquid market',
  },
  'Sales Volume': {
    what: 'Total AED value of all sales',
    for: 'Institutional investors & analysts',
    tip: 'Reflects overall market size',
  },
  'Avg Yield': {
    what: 'Average annual rent ÷ average sale price',
    for: 'Income investors',
    good: '>7% excellent | 5-7% good | <5% low',
    tip: 'Dubai average is historically 5-8%',
  },
  'Rent Contracts': {
    what: 'Ejari-registered rental contracts 2025–2026',
    for: 'Landlords & rental investors',
    tip: 'All Dubai rentals must register with Ejari',
  },
  'Active RERA Brokers': {
    what: 'Currently licensed real estate agents',
    for: 'Buyers & renters verifying agents',
    tip: 'Always verify broker RERA license before dealing',
  },
  'Off-Plan Share': {
    what: '% of sales that are off-plan (under construction)',
    for: 'Market trend analysts',
    good: '>70% shows strong investor confidence',
    tip: "Dubai has one of world's highest off-plan ratios",
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

const TOOLTIP_WIDTH = 280;
const TOOLTIP_GAP = 10;

/**
 * Contextual info icon that reveals an explanatory tooltip on hover (desktop)
 * or tap (mobile). The tooltip is rendered into a portal at document.body so
 * it can never be clipped by an overflow-hidden ancestor (e.g. the dashboard
 * section cards). Position is recomputed from the trigger's bounding rect.
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
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    placement: 'top' | 'bottom';
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const half = TOOLTIP_WIDTH / 2;
    const margin = 8;
    let centerX = rect.left + rect.width / 2;
    // Clamp horizontally so we never overflow the viewport
    centerX = Math.max(margin + half, Math.min(vw - margin - half, centerX));
    const left = centerX - half;
    const arrowLeftAbs = rect.left + rect.width / 2;
    const arrowLeft = arrowLeftAbs - left;

    // Choose top vs bottom based on space, default to caller's hint
    const wantTop = side === 'top';
    const aboveSpace = rect.top;
    const belowSpace = vh - rect.bottom;
    const placement: 'top' | 'bottom' =
      wantTop && aboveSpace > 80 ? 'top' : belowSpace > 80 ? 'bottom' : 'top';

    const top =
      placement === 'top'
        ? rect.top - TOOLTIP_GAP
        : rect.bottom + TOOLTIP_GAP;

    setPos({ top, left, arrowLeft, placement });
  }, [side]);

  // Recompute on open + on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // Tap-elsewhere-to-hide for mobile.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
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
    <span className={cn('inline-flex items-center align-middle', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${metric}`}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
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
      {mounted && open && pos
        ? createPortal(
            <div
              role="tooltip"
              className={cn(
                'fixed pointer-events-none z-[100]',
                'rounded-md shadow-xl border border-border px-3 py-2.5',
                'text-[11px] leading-snug text-fg',
              )}
              style={{
                top: pos.top,
                left: pos.left,
                width: TOOLTIP_WIDTH,
                maxWidth: '92vw',
                backgroundColor: '#1a1a2e',
                transform:
                  pos.placement === 'top' ? 'translateY(-100%)' : 'none',
              }}
            >
              <div className="font-semibold text-fg mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate">{metric}</span>
                {value && (
                  <span className="tabular text-accent font-mono shrink-0">
                    {value}
                  </span>
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
                {content.good && (
                  <div>
                    <span className="text-fg-subtle">Good:</span>{' '}
                    <span className="text-accent font-medium">{content.good}</span>
                  </div>
                )}
                <div className="pt-1 mt-1 border-t border-border/50 text-fg-muted italic">
                  {content.tip}
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'absolute h-2 w-2 rotate-45 border-border',
                  pos.placement === 'top'
                    ? 'top-full -mt-1 border-r border-b'
                    : 'bottom-full -mb-1 border-l border-t',
                )}
                style={{
                  left: Math.max(8, Math.min(TOOLTIP_WIDTH - 16, pos.arrowLeft)) - 4,
                  backgroundColor: '#1a1a2e',
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
