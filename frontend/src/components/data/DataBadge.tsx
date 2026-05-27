import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatPercent, formatNumber, formatAED } from '@/lib/format';

interface DataBadgeProps {
  value: number | null | undefined;
  format?: 'percent' | 'number' | 'currency';
  precision?: number;
  arrow?: boolean;
  className?: string;
  invertTone?: boolean;
}

export function DataBadge({
  value,
  format = 'percent',
  precision = 2,
  arrow = true,
  className,
  invertTone = false,
}: DataBadgeProps) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={cn('text-fg-subtle text-xs tabular', className)}>—</span>;
  }

  const positive = invertTone ? value < 0 : value >= 0;
  const tone = value === 0 ? 'neutral' : positive ? 'positive' : 'negative';
  const Icon = value === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  const formatted =
    format === 'percent'
      ? formatPercent(value, precision)
      : format === 'currency'
        ? formatAED(value, { compact: true })
        : formatNumber(value, precision);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular',
        tone === 'positive' && 'text-positive',
        tone === 'negative' && 'text-negative',
        tone === 'neutral' && 'text-fg-muted',
        className
      )}
    >
      {arrow && <Icon className="h-3 w-3" strokeWidth={2.5} />}
      {value > 0 && format === 'percent' && !formatted.startsWith('+') ? '+' : ''}
      {formatted}
    </span>
  );
}
