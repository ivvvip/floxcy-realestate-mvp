'use client';

import { useEffect, useState } from 'react';
import { Search, Phone, ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react';
import { getDldBrokers } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { DldBrokerItem } from '@/lib/types';

const PAGE_SIZE = 25;

export function BrokersDirectoryClient() {
  const [q, setQ] = useState('');
  const [firm, setFirm] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DldBrokerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce + load
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getDldBrokers({
          q: q.trim() || undefined,
          firm: firm.trim() || undefined,
          active: activeOnly ? true : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        setItems(res.items);
        setTotal(res.total_available);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not load broker directory.'
        );
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, firm, activeOnly, page]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [q, firm, activeOnly]);

  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label
            htmlFor="broker_q"
            className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Broker name
          </label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              id="broker_q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Ahmed, Sara…"
              className="input-field pl-9"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="broker_firm"
            className="block text-[11px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Firm / agency
          </label>
          <input
            id="broker_firm"
            type="search"
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
            placeholder="e.g. Luxfolio, Allsopp…"
            className="input-field mt-1"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-fg-muted whitespace-nowrap pb-2">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Active license only
        </label>
      </div>

      {/* Count line */}
      <div className="flex items-center justify-between text-[11px] text-fg-subtle">
        <span>
          {loading
            ? 'Searching…'
            : total === 0
              ? 'No brokers match these filters'
              : `${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        {error && <span className="text-negative">{error}</span>}
      </div>

      {/* Results */}
      <div className="card overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_1.4fr_140px_120px_140px] gap-3 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wide text-fg-subtle font-medium bg-bg-elev">
          <div>Broker</div>
          <div>Firm</div>
          <div>License #</div>
          <div>Status</div>
          <div>License ends</div>
        </div>
        <ul className="divide-y divide-border">
          {items.map((b) => (
            <li
              key={b.broker_number}
              className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_140px_120px_140px] gap-1 md:gap-3 px-4 py-3 text-sm hover:bg-bg-elev/40"
            >
              <div>
                <div className="text-fg truncate" title={b.full_name}>
                  {b.full_name}
                </div>
                {b.phone && (
                  <div className="md:hidden mt-1 text-[11px] text-fg-subtle inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" strokeWidth={2} /> {b.phone}
                  </div>
                )}
              </div>
              <div className="text-fg-muted truncate" title={b.real_estate_name ?? undefined}>
                {b.real_estate_name ?? '—'}
              </div>
              <div className="font-mono text-fg-muted">{b.broker_number}</div>
              <div>
                {b.is_active ? (
                  <span className="inline-flex items-center gap-1 rounded bg-positive/10 px-1.5 py-0.5 text-[11px] text-positive">
                    <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-negative/10 px-1.5 py-0.5 text-[11px] text-negative">
                    <ShieldAlert className="h-3 w-3" strokeWidth={2.5} /> Expired
                  </span>
                )}
              </div>
              <div className="font-mono text-fg-muted text-xs">
                {b.license_end_date ?? '—'}
                {b.webpage && (
                  <a
                    href={b.webpage}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ml-2 inline-flex items-center gap-0.5 text-accent hover:underline"
                  >
                    site
                    <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
                  </a>
                )}
              </div>
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-fg-subtle">
              No brokers match these filters. Try a different name or clear the
              firm field.
            </li>
          )}
        </ul>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className={cn(
              'btn-secondary',
              (page === 0 || loading) && 'opacity-40 cursor-not-allowed'
            )}
          >
            Previous
          </button>
          <span className="text-fg-subtle">
            Page <span className="font-mono text-fg">{page + 1}</span> of{' '}
            <span className="font-mono text-fg">
              {totalPages.toLocaleString()}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages || loading}
            className={cn(
              'btn-secondary',
              (page + 1 >= totalPages || loading) &&
                'opacity-40 cursor-not-allowed'
            )}
          >
            Next
          </button>
        </div>
      )}

      <p className="text-[11px] text-fg-subtle">
        Source: Dubai Land Department Open Data. Always verify a broker&apos;s
        identity in person before transferring funds — match the displayed
        license number against the broker&apos;s RERA card.
      </p>
    </div>
  );
}
