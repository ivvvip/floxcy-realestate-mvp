import Link from 'next/link';
import type { Area } from '@/lib/types';
import { cn } from '@/lib/cn';

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
        'surface-card group relative flex h-full flex-col overflow-hidden p-6 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-glow',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl transition-opacity duration-300 group-hover:opacity-100 opacity-50"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-fg">
            {area.name}
          </h3>
          {area.name_arabic && (
            <p className="mt-0.5 truncate text-sm text-fg-muted" dir="rtl">
              {area.name_arabic}
            </p>
          )}
        </div>
        <span className="pill pill-accent whitespace-nowrap">{typeLabel}</span>
      </div>

      {area.description && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-fg-muted">
          {area.description}
        </p>
      )}

      <div className="mt-6 flex items-end justify-between gap-3 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>
            {area.city}, {area.emirate}
          </span>
        </div>

        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-transform group-hover:translate-x-0.5">
          View details
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
