import Link from 'next/link';
import { MapPin, ArrowUpRight } from 'lucide-react';
import type { Area } from '@/lib/types';
import { cn } from '@/lib/cn';
import { formatAED, formatPercent } from '@/lib/format';
import { DataBadge } from './data/DataBadge';

interface AreaCardProps {
  area: Area;
  className?: string;
}

const TYPE_LABEL: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  mixed: 'Mixed-Use',
};

export function AreaCard({ area, className }: AreaCardProps) {
  const typeLabel = TYPE_LABEL[area.area_type] ?? area.area_type;

  return (
    <Link
      href={`/areas/${area.id}`}
      className={cn(
        'surface-card group flex h-full flex-col p-4 transition-colors',
        'hover:border-border-strong hover:bg-bg-elev/30',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-fg group-hover:text-accent transition-colors">
            {area.name}
          </h3>
          {area.name_arabic && (
            <p className="mt-0.5 truncate text-xs text-fg-muted" dir="rtl">
              {area.name_arabic}
            </p>
          )}
        </div>
        <span className="pill whitespace-nowrap">{typeLabel}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border">
        <div className="px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Yield</div>
          <div className="mt-0.5 text-sm tabular text-fg">
            {area.latest_yield != null ? formatPercent(area.latest_yield, 1) : '—'}
          </div>
        </div>
        <div className="px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">AED/sqft</div>
          <div className="mt-0.5 text-sm tabular text-fg">
            {area.latest_price_per_sqft != null
              ? new Intl.NumberFormat('en-US').format(area.latest_price_per_sqft)
              : '—'}
          </div>
        </div>
        <div className="px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">1Y</div>
          <div className="mt-0.5 text-sm">
            {area.appreciation_1y != null ? (
              <DataBadge value={area.appreciation_1y} format="percent" precision={1} />
            ) : (
              <span className="text-fg-subtle tabular">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-[11px] text-fg-subtle">
          <MapPin className="h-3 w-3" strokeWidth={2} />
          <span>
            {area.city}, {area.emirate}
          </span>
        </div>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-fg-muted group-hover:text-accent transition-colors">
          Detail
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </span>
      </div>
    </Link>
  );
}
