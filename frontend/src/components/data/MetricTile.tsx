import { cn } from '@/lib/cn';
import { DataBadge } from './DataBadge';
import { MetricTooltip, type MetricKey } from '@/components/MetricTooltip';

interface MetricTileProps {
  label: string;
  value: string | number | React.ReactNode;
  delta?: number | null;
  deltaFormat?: 'percent' | 'number' | 'currency';
  hint?: string;
  mono?: boolean;
  className?: string;
  tone?: 'default' | 'positive' | 'negative' | 'accent';
  tooltip?: MetricKey | string;
}

export function MetricTile({
  label,
  value,
  delta,
  deltaFormat = 'percent',
  hint,
  mono = false,
  className,
  tone = 'default',
  tooltip,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        'flex-1 min-w-[160px] px-5 py-4 border-r border-border last:border-r-0',
        className
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center">
        {label}
        {tooltip && <MetricTooltip metric={tooltip} />}
      </div>
      <div
        className={cn(
          'mt-1.5 text-2xl leading-tight tabular',
          mono && 'font-mono',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'accent' && 'text-accent'
        )}
      >
        {value}
      </div>
      {(delta != null || hint) && (
        <div className="mt-1.5 flex items-center gap-2">
          {delta != null && <DataBadge value={delta} format={deltaFormat} />}
          {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
        </div>
      )}
    </div>
  );
}
