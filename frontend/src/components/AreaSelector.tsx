'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { areaMatchesQuery, primaryAlias } from '@/lib/areaSynonyms';

/**
 * Shared area dropdown — single source of truth across /rent-check,
 * /buildings, /opportunities, /compare, /brokers/directory.
 *
 * Always renders ALL 284 areas (callers fetch with min_occurrences=0),
 * sorted A-Z, with a data-state suffix on each label so users can see
 * "no data" / "limited data" / "(N records)" without the area being
 * hidden.
 *
 * Generic over the option type so callers can carry extra fields
 * (e.g. /rent-check needs rent_count + median_annual_rent for its
 * suggestion sidebar). Any caller-shape that includes name + name_norm
 * + occurrence_count works.
 */
export interface BaseAreaOption {
  name: string;
  name_norm: string;
  /**
   * Total records across all DLD source datasets (lands + rents +
   * transactions). Drives the data-state suffix.
   */
  occurrence_count: number;
}

interface Props<T extends BaseAreaOption> {
  value: T | null;
  onChange: (v: T | null) => void;
  options: T[];
  /** Override the default label "Area". */
  label?: string;
  /** Override the default placeholder when no area is picked. */
  placeholder?: string;
  /** Hide the "clear" button (some flows require a selection). */
  required?: boolean;
}

const LIMITED_DATA_THRESHOLD = 100; // < 100 records → "(limited data)"

function dataStateSuffix(occurrence_count: number): string {
  if (occurrence_count >= LIMITED_DATA_THRESHOLD) {
    return ` (${occurrence_count.toLocaleString()} records)`;
  }
  if (occurrence_count > 0) {
    return ` (limited data — ${occurrence_count} records)`;
  }
  return ' (no data yet)';
}

export function AreaSelector<T extends BaseAreaOption>({
  value,
  onChange,
  options,
  label = 'Area',
  placeholder = 'All areas',
  required = false,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Sort A-Z once per options-array change. Callers usually pass a fresh
  // array per render — useMemo prevents repeated work inside the dropdown.
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name)),
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    // Match on the DLD display name OR any marketing-name synonym, so
    // typing "Downtown" / "JLT" / "Maritime City" finds the right area
    // even though DLD files them under cadastral names.
    return sorted.filter((o) => areaMatchesQuery(o, q));
  }, [sorted, query]);

  return (
    <div className="relative">
      <label className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-bg-card px-3 py-2.5 text-left text-sm min-h-[44px]"
      >
        <span className={cn(value ? 'text-fg' : 'text-fg-subtle', 'truncate')}>
          {value ? value.name : placeholder}
        </span>
        <div className="flex items-center gap-1.5">
          {value && !required && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-[11px] text-fg-subtle hover:text-fg"
            >
              clear
            </button>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-fg-subtle transition-transform',
              open && 'rotate-180',
            )}
            strokeWidth={2}
          />
        </div>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-bg-card shadow-lg max-h-[60vh] overflow-hidden flex flex-col">
          <div className="relative border-b border-border">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${filtered.length.toLocaleString()} areas…`}
              autoFocus
              className="w-full bg-transparent pl-9 pr-3 py-2.5 text-sm outline-none"
            />
          </div>
          <ul className="overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-fg-subtle">
                No areas match this filter.
              </li>
            )}
            {filtered.map((o) => {
              const hasData = o.occurrence_count >= LIMITED_DATA_THRESHOLD;
              const someData =
                o.occurrence_count > 0 && o.occurrence_count < LIMITED_DATA_THRESHOLD;
              return (
                <li key={o.name_norm}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-elev flex items-baseline gap-2"
                  >
                    <span className="text-fg truncate">{o.name}</span>
                    {primaryAlias(o.name_norm) && (
                      <span className="text-[10px] text-fg-subtle/70 shrink-0">
                        · {primaryAlias(o.name_norm)}
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-[10px] ml-auto shrink-0 tabular-nums',
                        hasData && 'text-fg-subtle',
                        someData && 'text-warning/80',
                        !hasData && !someData && 'text-fg-subtle/60',
                      )}
                    >
                      {dataStateSuffix(o.occurrence_count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
