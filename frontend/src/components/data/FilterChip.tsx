import { X, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  onDismiss?: () => void;
  count?: number;
  className?: string;
}

export function FilterChip({
  label,
  active = false,
  onClick,
  onDismiss,
  count,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-bg-card text-fg-muted hover:text-fg hover:border-border-strong',
        className
      )}
    >
      {active && <Check className="h-3 w-3" strokeWidth={2.5} />}
      <span>{label}</span>
      {count != null && (
        <span className="rounded bg-bg-elev/80 px-1 text-[10px] tabular text-fg-subtle">
          {count}
        </span>
      )}
      {onDismiss && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onDismiss();
            }
          }}
          className="ml-0.5 -mr-1 p-0.5 rounded hover:bg-bg-elev/80 cursor-pointer"
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
