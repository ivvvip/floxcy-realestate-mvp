import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { OpportunityResult, OpportunityType } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DataBadge } from './DataBadge';

const TYPE_TONE: Record<OpportunityType, string> = {
  'Premium Hold': 'pill-accent',
  'Growth Opportunity': 'pill-positive',
  Speculative: 'pill-negative',
  'Income Opportunity': 'pill-positive',
  'Value Opportunity': 'pill-accent',
  Balanced: '',
};

function scoreColor(score: number): string {
  if (score >= 75) return 'text-positive';
  if (score >= 60) return 'text-accent';
  if (score >= 45) return 'text-fg-muted';
  return 'text-negative';
}

export function OpportunityCard({ opp }: { opp: OpportunityResult }) {
  return (
    <Link
      href={`/areas/${opp.area_id}`}
      className="surface-card group block p-4 hover:border-border-strong transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate group-hover:text-accent transition-colors">
            {opp.area_name}
          </div>
          {opp.area_name_arabic && (
            <div className="text-[11px] text-fg-muted truncate" dir="rtl">
              {opp.area_name_arabic}
            </div>
          )}
        </div>
        <ArrowUpRight
          className="h-4 w-4 text-fg-subtle flex-shrink-0 group-hover:text-accent transition-colors"
          strokeWidth={2}
        />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <div
          className={cn(
            'text-3xl font-semibold tabular leading-none',
            scoreColor(opp.opportunity_score)
          )}
        >
          {opp.opportunity_score}
        </div>
        <span className="text-[11px] text-fg-subtle">/100</span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className={cn('pill', TYPE_TONE[opp.opportunity_type] ?? '')}>
          {opp.opportunity_type}
        </span>
        <span className="text-[10px] text-fg-subtle tabular">
          {(opp.confidence_level * 100).toFixed(0)}% confidence
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[11px]">
        <div>
          <dt className="text-fg-subtle uppercase tracking-wide">Yield</dt>
          <dd className="mt-0.5 text-fg tabular font-medium">
            {formatPercent(opp.key_metrics.rental_yield, 2)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-subtle uppercase tracking-wide">AED/sqft</dt>
          <dd className="mt-0.5 text-fg tabular font-medium">
            {formatNumber(opp.key_metrics.price_per_sqft, 0)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-subtle uppercase tracking-wide">1Y</dt>
          <dd className="mt-0.5">
            <DataBadge value={opp.key_metrics.appreciation_1y} format="percent" precision={1} />
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[11px] text-fg-muted leading-relaxed line-clamp-2">
        {opp.best_for}
      </p>
    </Link>
  );
}
