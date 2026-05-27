'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  accessor?: (row: T) => string | number | null | undefined;
  cell?: (row: T) => React.ReactNode;
  width?: string;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  dense?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  defaultSort,
  dense = false,
  emptyState,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.accessor) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return undefined;
    });
  }

  if (!rows.length && emptyState) {
    return <div className="px-4 py-12 text-center text-fg-muted">{emptyState}</div>;
  }

  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const SortIcon = !active
                ? ChevronsUpDown
                : sort?.dir === 'desc'
                  ? ChevronDown
                  : ChevronUp;
              return (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center'
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-fg transition-colors',
                        col.align === 'right' && 'flex-row-reverse',
                        active && 'text-fg'
                      )}
                    >
                      <span>{col.header}</span>
                      <SortIcon className="h-3 w-3" strokeWidth={2} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const href = rowHref?.(row);
            const cells = columns.map((col) => (
              <td
                key={col.key}
                className={cn(
                  col.align === 'right' && 'num',
                  col.align === 'center' && 'text-center',
                  dense && 'py-1.5',
                  col.className
                )}
              >
                {col.cell ? col.cell(row) : (col.accessor?.(row) as React.ReactNode) ?? '—'}
              </td>
            ));
            if (href) {
              return (
                <tr
                  key={key}
                  className="cursor-pointer transition-colors group"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a,button')) return;
                    window.location.href = href;
                  }}
                >
                  {cells.map((cell, i) =>
                    i === 0 ? (
                      <td
                        key={columns[i].key}
                        className={cn(
                          columns[i].align === 'right' && 'num',
                          columns[i].align === 'center' && 'text-center',
                          dense && 'py-1.5',
                          columns[i].className
                        )}
                      >
                        <Link
                          href={href}
                          className="block group-hover:text-accent transition-colors"
                        >
                          {columns[i].cell
                            ? columns[i].cell!(row)
                            : (columns[i].accessor?.(row) as React.ReactNode) ?? '—'}
                        </Link>
                      </td>
                    ) : (
                      cell
                    )
                  )}
                </tr>
              );
            }
            return <tr key={key}>{cells}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
