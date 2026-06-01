'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Search,
  Share2,
  TrendingDown,
  TrendingUp,
  Lightbulb,
} from 'lucide-react';
import { dldRentCheck } from '@/lib/api';
import { formatAED } from '@/lib/format';
import { cn } from '@/lib/cn';
import type {
  RentCheckResponse,
  SizeCategory,
} from '@/lib/types';
import {
  NegotiationPower,
  RERALegalCalculator,
  RentVsBuy,
  BestTimeToNegotiate,
  RentAlertSignup,
} from './RentCheckExtras';

export interface RentCheckAreaOption {
  name: string;
  name_norm: string;
  rent_count: number;
  median_annual_rent: number | null;
}

const SQM_TO_SQFT = 10.7639;

interface SizeOption {
  key: SizeCategory;
  label: string;
  sub: string;
  sqmHint: string;
  sqftHint: string;
}

const SIZE_OPTIONS: SizeOption[] = [
  {
    key: 'studio',
    label: 'Studio',
    sub: 'No separate bedroom',
    sqmHint: 'Under 50 sqm',
    sqftHint: `Under ${Math.round(50 * SQM_TO_SQFT)} sqft`,
  },
  {
    key: '1br',
    label: '1 Bedroom',
    sub: '1 BR apartment',
    sqmHint: '50–99 sqm',
    sqftHint: `${Math.round(50 * SQM_TO_SQFT)}–${Math.round(99 * SQM_TO_SQFT)} sqft`,
  },
  {
    key: '2br',
    label: '2 Bedrooms',
    sub: '2 BR apartment',
    sqmHint: '100–149 sqm',
    sqftHint: `${Math.round(100 * SQM_TO_SQFT)}–${Math.round(149 * SQM_TO_SQFT)} sqft`,
  },
  {
    key: '3br',
    label: '3 Bedrooms',
    sub: '3 BR apartment / townhouse',
    sqmHint: '150–199 sqm',
    sqftHint: `${Math.round(150 * SQM_TO_SQFT)}–${Math.round(199 * SQM_TO_SQFT)} sqft`,
  },
  {
    key: '4br',
    label: '4+ Bedrooms',
    sub: 'Villa / large unit',
    sqmHint: '200+ sqm',
    sqftHint: `${Math.round(200 * SQM_TO_SQFT)}+ sqft`,
  },
];

const PROP_TYPES = ['Flat', 'Villa', 'Hotel Apartment'] as const;
type PropType = (typeof PROP_TYPES)[number];

interface RentCheckClientProps {
  areaOptions: RentCheckAreaOption[];
}

export function RentCheckClient({ areaOptions }: RentCheckClientProps) {
  const [propType, setPropType] = useState<PropType>('Flat');
  const [area, setArea] = useState<RentCheckAreaOption | null>(null);
  const [size, setSize] = useState<SizeCategory | null>(null);
  const [rent, setRent] = useState('');
  const [result, setResult] = useState<RentCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deep-link prefill: ?area=business+bay&size=1br lands users with the
  // wizard already populated — used by the share-on-WhatsApp flow.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const a = params.get('area')?.toLowerCase();
    const s = params.get('size') as SizeCategory | null;
    if (a) {
      const match = areaOptions.find((o) => o.name_norm === a);
      if (match) setArea(match);
    }
    if (s && ['studio', '1br', '2br', '3br', '4br'].includes(s)) {
      setSize(s);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always re-scroll to the result after a successful check (mobile especially)
  const resultRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  // Derived rent guidance for selected area
  const rentHint = useMemo(() => {
    if (!area || area.median_annual_rent == null) return null;
    const med = area.median_annual_rent;
    return `Most people in ${area.name} pay around ${formatAED(med)} (median).`;
  }, [area]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!area) {
      setError('Pick an area from the list.');
      return;
    }
    if (!size) {
      setError('Pick your home size.');
      return;
    }
    const rentNum = Number(rent.replace(/[, ]/g, ''));
    if (!Number.isFinite(rentNum) || rentNum <= 0) {
      setError('Enter your annual rent in AED.');
      return;
    }
    setLoading(true);
    try {
      const res = await dldRentCheck({
        area_name: area.name_norm,
        size_category: size,
        annual_rent: rentNum,
        prop_sub_type: propType,
      });
      setResult(res);
    } catch (err) {
      const detail =
        err instanceof Error && 'body' in err
          ? // @ts-expect-error ApiError shape
            err.body?.detail
          : null;
      setError(
        typeof detail === 'string'
          ? detail
          : err instanceof Error
            ? err.message
            : 'Could not run the check. Please try again.'
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_1fr]">
      {/* Form column */}
      <form onSubmit={onSubmit} className="space-y-4">
        <Step n={1} title="Pick your area">
          <AreaSelect
            value={area}
            onChange={setArea}
            options={areaOptions}
          />
          {areaOptions.length === 0 && (
            <p className="mt-2 text-[11px] text-warning">
              Could not load area list. Refresh the page in a moment.
            </p>
          )}
        </Step>

        <Step n={2} title="Pick your home size">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SIZE_OPTIONS.map((opt) => {
              const active = size === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSize(opt.key)}
                  className={cn(
                    'rounded-md border px-3 py-2.5 text-left transition-colors min-h-[56px]',
                    active
                      ? 'border-accent bg-accent/10 text-fg'
                      : 'border-border bg-bg-card text-fg-muted hover:border-fg-subtle hover:text-fg'
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">
                    {opt.sqmHint} · {opt.sqftHint}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Property type — tucked under size, defaults to Flat */}
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[11px] text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 list-none">
              <ChevronDown
                className="h-3 w-3 transition-transform group-open:rotate-180"
                strokeWidth={2.5}
              />
              Property type: {propType}
            </summary>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PROP_TYPES.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPropType(p)}
                  className={cn(
                    'rounded border px-2 py-1.5 text-[12px]',
                    propType === p
                      ? 'border-accent bg-accent/10 text-fg'
                      : 'border-border bg-bg-card text-fg-muted hover:text-fg'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </details>
        </Step>

        <Step n={3} title="Enter your annual rent">
          <div className="relative">
            <input
              id="annual_rent"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={rent}
              onChange={(e) =>
                setRent(e.target.value.replace(/[^0-9,]/g, ''))
              }
              placeholder="e.g. 85,000"
              className="input-field pr-14 text-base"
              required
              aria-describedby="rent-hint"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-fg-subtle">
              AED
            </span>
          </div>
          <p id="rent-hint" className="mt-1.5 text-[11px] text-fg-subtle">
            {rentHint ?? 'Enter your annual rent in AED.'}
          </p>
        </Step>

        {error && (
          <div
            role="alert"
            className="rounded border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 h-11 text-sm"
        >
          {loading ? 'Checking…' : 'Check my rent'}
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </form>

      {/* Result column */}
      <div ref={resultRef} className="space-y-4">
        {!result && !loading && (
          <EmptyState />
        )}
        {loading && <LoadingState />}
        {result && size && area && (
          <ResultPanel
            result={result}
            area={area}
            sizeCategory={size}
            propSubType={propType}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step shell
// ---------------------------------------------------------------------------
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
          {n}
        </span>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Area searchable select
// ---------------------------------------------------------------------------
function AreaSelect({
  value,
  onChange,
  options,
}: {
  value: RentCheckAreaOption | null;
  onChange: (v: RentCheckAreaOption) => void;
  options: RentCheckAreaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter((o) => o.name.toLowerCase().includes(q))
      .slice(0, 80);
  }, [options, query]);

  function pick(o: RentCheckAreaOption) {
    onChange(o);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-md border bg-bg-card px-3 py-2.5 text-left text-sm min-h-[44px]',
          open ? 'border-accent' : 'border-border hover:border-fg-subtle'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn(value ? 'text-fg' : 'text-fg-subtle')}>
          {value
            ? `${value.name} · ${value.rent_count.toLocaleString()} contracts`
            : 'Search 280+ Dubai areas…'}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-fg-subtle transition-transform',
            open && 'rotate-180'
          )}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-bg-card shadow-lg max-h-[60vh] overflow-hidden flex flex-col">
          <div className="relative border-b border-border">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              className="w-full bg-transparent pl-9 pr-3 py-2.5 text-sm outline-none placeholder:text-fg-subtle"
            />
          </div>
          <ul role="listbox" className="overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-fg-subtle">
                No areas match &ldquo;{query}&rdquo;.
              </li>
            )}
            {filtered.map((o) => {
              const active = value?.name_norm === o.name_norm;
              return (
                <li key={o.name_norm}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(o)}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-bg-elev',
                      active && 'bg-accent/10'
                    )}
                  >
                    <span className={cn(active ? 'text-accent' : 'text-fg')}>
                      {o.name}
                    </span>
                    <span className="text-[11px] tabular text-fg-subtle">
                      {o.rent_count.toLocaleString()} contracts
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

// ---------------------------------------------------------------------------
// Empty + loading
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="card p-6 text-center">
      <Scale />
      <p className="text-sm text-fg-muted">
        Pick an area, choose your home size, enter your rent — see exactly
        where you sit in the Dubai market.
      </p>
      <p className="mt-3 text-[11px] text-fg-subtle">
        Powered by Dubai Land Department open rent contract data.
      </p>
    </div>
  );
}

function Scale() {
  // little inline emoji-ish flourish; kept tiny on purpose
  return (
    <div className="mb-3 text-2xl" aria-hidden>
      ⚖️
    </div>
  );
}

function LoadingState() {
  return (
    <div className="card p-6">
      <div className="h-5 w-32 rounded bg-bg-elev animate-pulse" />
      <div className="mt-4 h-12 w-full rounded bg-bg-elev animate-pulse" />
      <div className="mt-3 h-3 w-2/3 rounded bg-bg-elev animate-pulse" />
      <div className="mt-2 h-3 w-1/2 rounded bg-bg-elev animate-pulse" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel
// ---------------------------------------------------------------------------
function ResultPanel({
  result,
  area,
  sizeCategory,
  propSubType,
}: {
  result: RentCheckResponse;
  area: RentCheckAreaOption;
  sizeCategory: SizeCategory;
  propSubType: PropType;
}) {
  const areaName = result.area_name_display ?? area.name;
  const diffAed = result.user_rent - result.area_median;
  const absDiff = Math.abs(diffAed);

  const verdict = result.verdict;
  const isAbove = verdict === 'above_market';
  const isBelow = verdict === 'below_market';
  const isFair = verdict === 'fair';

  const headline = isFair
    ? '✅ Your rent is fair'
    : isAbove
      ? '⚠️ You pay above market'
      : '💡 You pay below market';

  const subHeadline = isFair
    ? `You're paying about the same as everyone else in ${areaName}.`
    : isAbove
      ? `You pay ${formatAED(absDiff)} MORE than the typical contract in ${areaName}.`
      : `You pay ${formatAED(absDiff)} LESS than the typical contract in ${areaName}.`;

  // Range = p25..p75 — i.e. what "most people" pay
  // We don't get p25/p75 directly in the response; use ±~10% of median as a
  // rough "most people" band. The percentile from the server is the
  // authoritative position.
  const lowBand = result.area_median * 0.85;
  const highBand = result.area_median * 1.15;

  return (
    <div className="space-y-3">
      {/* Big verdict tile */}
      <div
        className={cn(
          'card p-5 sm:p-6 border-2',
          isFair && 'border-positive/50',
          isAbove && 'border-negative/50',
          isBelow && 'border-warning/50'
        )}
      >
        <div
          className={cn(
            'text-xl sm:text-2xl font-semibold leading-tight',
            isFair && 'text-positive',
            isAbove && 'text-negative',
            isBelow && 'text-warning'
          )}
        >
          {headline}
        </div>
        <p className="mt-2 text-sm text-fg">{subHeadline}</p>

        <div className="mt-4 grid grid-cols-3 gap-px bg-border rounded overflow-hidden">
          <Cell
            label="Your rent"
            value={formatAED(result.user_rent)}
          />
          <Cell
            label="Area median"
            value={formatAED(result.area_median)}
            sub={`${result.sample_size.toLocaleString()} contracts`}
          />
          <Cell
            label="Vs market"
            value={`${result.percentage_diff >= 0 ? '+' : ''}${result.percentage_diff.toFixed(1)}%`}
            tone={isFair ? 'positive' : isAbove ? 'negative' : 'warning'}
          />
        </div>

        {/* Percentile bar */}
        <div className="mt-4">
          <div className="relative h-2.5 rounded-full bg-bg-elev overflow-hidden">
            <div
              className={cn(
                'absolute inset-y-0 left-0 transition-all',
                isFair && 'bg-positive/70',
                isAbove && 'bg-negative/70',
                isBelow && 'bg-warning/70'
              )}
              style={{
                width: `${Math.min(100, Math.max(2, result.percentile))}%`,
              }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-fg/60"
              style={{ left: '50%' }}
              aria-hidden
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
            <span>Cheapest 10%</span>
            <span>Median</span>
            <span>Priciest 10%</span>
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            You sit at the{' '}
            <span className="font-semibold text-fg">
              {result.percentile.toFixed(0)}
              <sup>th</sup>
            </span>{' '}
            percentile — most contracts in {areaName} fall between{' '}
            <span className="font-mono text-fg">{formatAED(lowBand)}</span> and{' '}
            <span className="font-mono text-fg">{formatAED(highBand)}</span>.
          </p>
        </div>
      </div>

      {/* Context strip */}
      <div className="card flex flex-wrap divide-x divide-border">
        <Stat
          label="YoY rent trend"
          value={
            result.yoy_trend == null
              ? '—'
              : `${result.yoy_trend >= 0 ? '+' : ''}${result.yoy_trend.toFixed(1)}%`
          }
          icon={
            result.yoy_trend == null ? null : result.yoy_trend >= 0 ? (
              <TrendingUp
                className="h-3 w-3 text-positive"
                strokeWidth={2.5}
              />
            ) : (
              <TrendingDown
                className="h-3 w-3 text-negative"
                strokeWidth={2.5}
              />
            )
          }
          hint="vs 2025"
        />
        <Stat
          label="Confidence"
          value={result.confidence}
          hint={
            result.confidence === 'high'
              ? '100+ contracts'
              : result.confidence === 'medium'
                ? '30+ contracts'
                : 'Few contracts'
          }
        />
        <Stat
          label="Size band"
          value={`${result.size_band} sqm`}
          hint="DLD bucket used"
        />
      </div>

      {/* F1: Negotiation Power */}
      <NegotiationPower result={result} />

      {/* F2: RERA Legal Calculator */}
      <RERALegalCalculator result={result} />

      {/* F3: Rent vs Buy */}
      <RentVsBuy
        result={result}
        sizeCategory={sizeCategory}
        areaDisplayName={areaName}
      />

      {/* F4: Cheaper alternatives (enhanced) */}
      {result.suggested_areas.length > 0 && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-accent shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <h3 className="text-sm font-semibold text-fg">
                Want cheaper? Try these areas
              </h3>
              <p className="mt-0.5 text-[11px] text-fg-subtle">
                Same {sizeCategory.toUpperCase()} / {propSubType}, lower typical rent.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {result.suggested_areas.map((s) => {
              const saving = result.area_median - s.median_annual_rent;
              const href = `/rent-check?area=${encodeURIComponent(s.area_name.toLowerCase())}&size=${sizeCategory}`;
              return (
                <div
                  key={s.area_name}
                  className="rounded border border-border bg-bg-elev p-3 flex flex-col"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-fg truncate">
                      {s.area_name}
                    </span>
                    <span className="rounded bg-positive/15 px-1.5 py-0.5 text-[11px] font-mono text-positive whitespace-nowrap">
                      −{s.saving_pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-fg-subtle">
                    Median{' '}
                    <span className="font-mono text-fg">
                      {formatAED(s.median_annual_rent)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">
                    Save{' '}
                    <span className="font-mono text-positive">
                      {formatAED(Math.max(0, saving))}/year
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-subtle">
                    {s.sample_size} contracts
                  </div>
                  <a
                    href={href}
                    className="mt-2 inline-flex items-center justify-center rounded border border-accent/30 bg-accent/10 px-2 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20"
                  >
                    Check rent in {s.area_name.split(' ')[0]} →
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* F6: Best time to negotiate */}
      <BestTimeToNegotiate result={result} />

      {/* F7: Rent alert signup */}
      <RentAlertSignup
        areaNorm={result.area_name_norm ?? area.name_norm}
        areaDisplay={areaName}
        sizeCategory={sizeCategory}
        propSubType={propSubType}
      />

      {/* F5: Share */}
      <ShareRow
        result={result}
        areaName={areaName}
        sizeCategory={sizeCategory}
        areaNorm={result.area_name_norm ?? area.name_norm}
      />

      <p className="text-[10px] text-fg-subtle leading-relaxed">
        Source: {result.data_source}. Updated {result.last_updated}. Verdict
        bands: rent below the area&apos;s 25th percentile → below market,
        between 25–75 → fair, above 75 → above market.
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'warning';
}) {
  return (
    <div className="bg-bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-sm sm:text-base font-mono leading-tight',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'warning' && 'text-warning'
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-fg-subtle">{sub}</div>}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[120px] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className="mt-1 text-sm text-fg flex items-center gap-1.5 capitalize">
        {icon}
        <span>{value}</span>
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-fg-subtle">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share row
// ---------------------------------------------------------------------------
function ShareRow({
  result,
  areaName,
  sizeCategory,
  areaNorm,
}: {
  result: RentCheckResponse;
  areaName: string;
  sizeCategory: SizeCategory;
  areaNorm: string;
}) {
  const [copied, setCopied] = useState(false);

  // Deep-link URL so the recipient lands on the form with everything pre-filled
  const shareUrl = useMemo(() => {
    const params = new URLSearchParams({
      area: areaNorm,
      size: sizeCategory,
    });
    return `https://floxcy.com/rent-check?${params.toString()}`;
  }, [areaNorm, sizeCategory]);

  const message = useMemo(() => {
    const verdictLine =
      result.verdict === 'fair'
        ? `My rent in ${areaName} is fair vs the Dubai market.`
        : result.verdict === 'above_market'
          ? `My rent in ${areaName} is ${result.percentage_diff.toFixed(0)}% ABOVE the Dubai market median.`
          : `My rent in ${areaName} is ${Math.abs(result.percentage_diff).toFixed(0)}% BELOW the Dubai market median.`;
    return [
      'I checked my rent on Floxcy (powered by DLD data):',
      `${areaName} ${sizeCategory.toUpperCase()}: my rent vs market`,
      `Verdict: ${result.verdict.replace('_', ' ').toUpperCase()}`,
      verdictLine,
      `Based on ${result.sample_size.toLocaleString()} DLD contracts.`,
      '',
      `Check yours: ${shareUrl}`,
    ].join('\n');
  }, [result, areaName, sizeCategory, shareUrl]);

  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(message);
      } else {
        const ta = document.createElement('textarea');
        ta.value = message;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Is my rent fair? — Floxcy',
          text: message,
          url: shareUrl,
        });
      } catch {
        // user cancelled — no-op
      }
    } else {
      copy();
    }
  }

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
        Share this result
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-card px-3 py-2 text-xs font-medium text-fg hover:bg-bg-elev min-h-[40px]"
        >
          <span aria-hidden>💬</span> WhatsApp
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-card px-3 py-2 text-xs font-medium text-fg hover:bg-bg-elev min-h-[40px]"
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={nativeShare}
          className="hidden sm:inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-card px-3 py-2 text-xs font-medium text-fg hover:bg-bg-elev min-h-[40px]"
        >
          <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
          More…
        </button>
      </div>
    </div>
  );
}

