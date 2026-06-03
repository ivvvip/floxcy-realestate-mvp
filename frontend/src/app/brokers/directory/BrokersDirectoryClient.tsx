'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronDown,
  Globe,
  Info,
  Languages,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  brokerConsultation,
  brokerMatch,
  getDldBrokers,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { AreaSelector } from '@/components/AreaSelector';
import type {
  BrokerGoal,
  BrokerMatchItem,
  BudgetBand,
  DldBrokerItem,
  DldStatsResponse,
  LangPref,
  TopCompanyItem,
} from '@/lib/types';

const PAGE_SIZE = 24;

interface AreaOption {
  name: string;
  name_norm: string;
  occurrence_count: number;
}

interface Props {
  areaOptions: AreaOption[];
  topCompanies: TopCompanyItem[];
  stats: DldStatsResponse | null;
}

// ---------------------------------------------------------------------------

export function BrokersDirectoryClient({
  areaOptions,
  topCompanies,
  stats,
}: Props) {
  // Browse-list state
  const [q, setQ] = useState('');
  const [firm, setFirm] = useState('');
  const [active, setActive] = useState<'active' | 'expiring' | 'all'>('active');
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all');
  const [nationality, setNationality] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'firm'>('name');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DldBrokerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Consultation modal state
  const [consultationFor, setConsultationFor] = useState<
    BrokerMatchItem | DldBrokerItem | null
  >(null);

  // Wizard result
  const [wizardResults, setWizardResults] = useState<BrokerMatchItem[] | null>(null);

  // Browse load
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await getDldBrokers({
          q: q.trim() || undefined,
          firm: firm.trim() || undefined,
          active: active === 'all' ? undefined : true,
          gender: gender === 'all' ? undefined : gender,
          nationality: nationality === 'all' ? undefined : nationality,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        setItems(res.items);
        setTotal(res.total_available);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, firm, active, gender, nationality, page]);

  useEffect(() => {
    setPage(0);
  }, [q, firm, active, gender, nationality, sortBy]);

  return (
    <div className="space-y-6">
      {/* SECTION 6 — RERA verification info box (top so users see it before browsing) */}
      <ReraInfoBox lastUpdated={stats?.last_updated} />

      {/* SECTION 2 — Smart Broker Finder Wizard */}
      <BrokerWizard
        areaOptions={areaOptions}
        onResults={setWizardResults}
        onPick={setConsultationFor}
        results={wizardResults}
      />

      {/* SECTION 5 — Top Companies Leaderboard */}
      {topCompanies.length > 0 && (
        <TopCompanies
          items={topCompanies}
          onPickFirm={(name) => {
            setFirm(name);
            setActive('active');
            // scroll the browse table into view
            requestAnimationFrame(() => {
              document
                .getElementById('broker-browse')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }}
        />
      )}

      {/* SECTION 7 — Filters (collapsible on mobile) */}
      <BrowseFilters
        q={q}
        setQ={setQ}
        firm={firm}
        setFirm={setFirm}
        active={active}
        setActive={setActive}
        gender={gender}
        setGender={setGender}
        nationality={nationality}
        setNationality={setNationality}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />

      {/* SECTION 3 — Browse list */}
      <BrokerBrowseList
        items={items}
        loading={loading}
        total={total}
        page={page}
        onPage={setPage}
        onPick={setConsultationFor}
        sortBy={sortBy}
      />

      {consultationFor && (
        <ConsultationModal
          broker={consultationFor}
          onClose={() => setConsultationFor(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 2 — Smart Broker Finder Wizard
// ---------------------------------------------------------------------------

const GOALS: { key: BrokerGoal; label: string; icon: string }[] = [
  { key: 'buy', label: 'Buy Property', icon: '🏠' },
  { key: 'rent', label: 'Rent Property', icon: '🔑' },
  { key: 'sell', label: 'Sell Property', icon: '💰' },
];

const LANGS: { key: LangPref; label: string; flag: string }[] = [
  { key: 'arabic', label: 'Arabic', flag: '🌍' },
  { key: 'english', label: 'English', flag: '🇬🇧' },
  { key: 'russian', label: 'Russian', flag: '🇷🇺' },
  { key: 'chinese', label: 'Chinese', flag: '🇨🇳' },
  { key: 'hindi', label: 'Hindi/Urdu', flag: '🇮🇳' },
  { key: 'filipino', label: 'Tagalog', flag: '🇵🇭' },
  { key: 'other', label: 'Other', flag: '🌐' },
];

const BUDGETS: { key: BudgetBand; label: string }[] = [
  { key: 'under_500k', label: 'Under 500K' },
  { key: '500k_1m', label: '500K–1M' },
  { key: '1m_3m', label: '1M–3M' },
  { key: '3m_5m', label: '3M–5M' },
  { key: '5m_plus', label: '5M+' },
];

function BrokerWizard({
  areaOptions,
  onResults,
  results,
  onPick,
}: {
  areaOptions: AreaOption[];
  onResults: (r: BrokerMatchItem[] | null) => void;
  results: BrokerMatchItem[] | null;
  onPick: (b: BrokerMatchItem) => void;
}) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<BrokerGoal | null>(null);
  const [area, setArea] = useState<AreaOption | null>(null);
  const [language, setLanguage] = useState<LangPref | null>(null);
  const [budget, setBudget] = useState<BudgetBand | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalSteps = goal === 'rent' ? 3 : 4;

  async function submit() {
    if (!goal) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await brokerMatch({
        goal,
        preferred_area_norm: area?.name_norm,
        language: language ?? undefined,
        budget_band: budget ?? undefined,
      });
      onResults(res.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not match brokers.');
      onResults(null);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setGoal(null);
    setArea(null);
    setLanguage(null);
    setBudget(null);
    onResults(null);
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-fg">
          Find My Broker — 4-tap smart match
        </h2>
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">
        Filter by goal · area · language · budget. Returns 5 top brokers ranked
        by firm size and license recency.
      </p>

      {/* Stepper */}
      <ol className="mt-3 flex items-center gap-1 text-[10px] text-fg-subtle">
        {[1, 2, 3, 4].map((n) => (
          <li key={n} className="flex items-center gap-1">
            <span
              className={cn(
                'grid h-5 w-5 place-items-center rounded-full font-semibold',
                n === step
                  ? 'bg-accent text-accent-fg'
                  : n < step
                    ? 'bg-positive/20 text-positive'
                    : 'bg-bg-elev text-fg-subtle'
              )}
            >
              {n}
            </span>
            {n < 4 && (
              <span
                className={cn(
                  'h-px w-3',
                  n < step ? 'bg-positive/40' : 'bg-border'
                )}
              />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4">
        {step === 1 && (
          <StepWrap title="What do you need?">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GOALS.map((g) => (
                <BigChoice
                  key={g.key}
                  emoji={g.icon}
                  label={g.label}
                  active={goal === g.key}
                  onClick={() => {
                    setGoal(g.key);
                    setStep(2);
                  }}
                />
              ))}
            </div>
          </StepWrap>
        )}

        {step === 2 && (
          <StepWrap title="Preferred area?">
            <AreaSelector value={area} onChange={setArea} options={areaOptions} />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-secondary inline-flex h-10 items-center justify-center px-3 text-xs"
              >
                Skip if unsure
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!area}
                className={cn(
                  'btn-primary inline-flex h-10 items-center justify-center gap-1.5 px-4 text-xs flex-1',
                  !area && 'opacity-50 cursor-not-allowed'
                )}
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </StepWrap>
        )}

        {step === 3 && (
          <StepWrap title="Preferred language?">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LANGS.map((l) => (
                <BigChoice
                  key={l.key}
                  emoji={l.flag}
                  label={l.label}
                  active={language === l.key}
                  onClick={() => {
                    setLanguage(l.key);
                    if (goal === 'rent') {
                      // Skip budget step for rentals — auto-submit
                      setTimeout(submit, 50);
                    } else {
                      setStep(4);
                    }
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (goal === 'rent') {
                    submit();
                  } else {
                    setStep(4);
                  }
                }}
                className="btn-secondary inline-flex h-10 items-center justify-center px-3 text-xs"
              >
                Skip language
              </button>
            </div>
          </StepWrap>
        )}

        {step === 4 && goal !== 'rent' && (
          <StepWrap title="Budget range?">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BUDGETS.map((b) => (
                <BigChoice
                  key={b.key}
                  label={b.label}
                  active={budget === b.key}
                  onClick={() => {
                    setBudget(b.key);
                    setTimeout(submit, 50);
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="btn-primary inline-flex h-10 items-center justify-center gap-1.5 px-4 text-xs flex-1"
              >
                {loading ? 'Matching…' : 'Find My Broker'}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </StepWrap>
        )}
      </div>

      {err && (
        <p className="mt-3 text-xs text-negative">{err}</p>
      )}

      {/* Wizard results */}
      {results && results.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-fg">
              Top {results.length} match{results.length === 1 ? '' : 'es'}
            </h3>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-accent hover:underline"
            >
              Start over
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((b) => (
              <BrokerCard
                key={b.broker_number}
                broker={b}
                onPick={() => onPick(b)}
              />
            ))}
          </div>
        </div>
      )}

      {results && results.length === 0 && (
        <p className="mt-4 text-xs text-warning">
          No brokers matched those filters. Try without the language filter.
        </p>
      )}
    </section>
  );
}

function StepWrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-fg mb-2.5">{title}</div>
      {children}
    </div>
  );
}

function BigChoice({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm min-h-[52px] transition-colors',
        active
          ? 'border-accent bg-accent/10 text-fg'
          : 'border-border bg-bg-card text-fg-muted hover:border-fg-subtle hover:text-fg'
      )}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      <span className="font-medium">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SECTION 3 — Broker cards (used in wizard + browse list)
// ---------------------------------------------------------------------------

function licenseBadge(status: string, days: number | null | undefined) {
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-negative/15 px-1.5 py-0.5 text-[10px] text-negative">
        <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />
        Expired
      </span>
    );
  }
  if (status === 'expiring_soon') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
        <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />
        Expires in {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-positive/15 px-1.5 py-0.5 text-[10px] text-positive">
      <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />
      RERA Verified
    </span>
  );
}

function BrokerCard({
  broker,
  onPick,
}: {
  broker: BrokerMatchItem;
  onPick: () => void;
}) {
  const start = broker.license_start_date
    ? new Date(broker.license_start_date).getFullYear()
    : null;
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate flex items-center gap-1.5">
            {broker.nationality_flag && (
              <span
                title={`Estimated ${broker.detected_nationality ?? 'nationality'} — from name pattern, not DLD-verified`}
                className="text-base leading-none shrink-0"
              >
                {broker.nationality_flag}
              </span>
            )}
            <span className="truncate">{broker.full_name}</span>
          </div>
          {broker.real_estate_name && (
            <div className="mt-0.5 text-[11px] text-fg-muted truncate">
              {broker.real_estate_name} ·{' '}
              {broker.company_size_active_brokers.toLocaleString()} active
              brokers
            </div>
          )}
        </div>
        {licenseBadge(broker.license_status, broker.days_until_expiry)}
      </div>
      {broker.detected_nationality && broker.detected_nationality !== 'Other' && (
        <div className="mt-1.5">
          <span
            className="text-[10px] inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev/40 px-2 py-0.5 text-fg-muted"
            title="Estimated from broker name — DLD does not publish broker nationality"
          >
            {broker.nationality_flag} Estimated {broker.detected_nationality} broker
          </span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
        {broker.gender && (
          <span className="inline-flex items-center gap-1">
            👤 {broker.gender}
          </span>
        )}
        {start && (
          <span className="inline-flex items-center gap-1">
            Since {start}
          </span>
        )}
        {broker.detected_language && (
          <span className="inline-flex items-center gap-1">
            <Languages className="h-3 w-3" strokeWidth={2.5} />
            {broker.detected_language}
          </span>
        )}
        {broker.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" strokeWidth={2.5} />
            {broker.phone}
          </span>
        )}
      </div>
      <div className="mt-3 text-[11px] text-fg-subtle">
        License ends{' '}
        <span className="font-mono text-fg">
          {broker.license_end_date ?? '—'}
        </span>
      </div>
      <button
        type="button"
        onClick={onPick}
        className="mt-3 btn-primary inline-flex items-center justify-center gap-1.5 h-10 text-xs"
      >
        Request Consultation
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function SimpleBrokerCard({
  broker,
  onPick,
}: {
  broker: DldBrokerItem;
  onPick: () => void;
}) {
  // Compute a quick license status client-side using the snapshot date.
  const status = (() => {
    if (!broker.license_end_date) return { s: 'active' as const, d: null as number | null };
    const end = new Date(broker.license_end_date).getTime();
    const today = new Date('2026-06-01').getTime();
    const days = Math.floor((end - today) / 86_400_000);
    if (days < 0) return { s: 'expired' as const, d: days };
    if (days <= 90) return { s: 'expiring_soon' as const, d: days };
    return { s: 'active' as const, d: days };
  })();
  const start = broker.license_start_date
    ? new Date(broker.license_start_date).getFullYear()
    : null;
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate flex items-center gap-1.5">
            {broker.nationality_flag && (
              <span
                title={`Estimated ${broker.detected_nationality ?? 'nationality'} — from name, not DLD-verified`}
                className="text-base leading-none shrink-0"
              >
                {broker.nationality_flag}
              </span>
            )}
            <span className="truncate">{broker.full_name}</span>
          </div>
          {broker.real_estate_name && (
            <div className="mt-0.5 text-[11px] text-fg-muted truncate">
              {broker.real_estate_name}
            </div>
          )}
        </div>
        {licenseBadge(status.s, status.d)}
      </div>
      {broker.detected_nationality && broker.detected_nationality !== 'Other' && (
        <div className="mt-1.5">
          <span
            className="text-[10px] inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev/40 px-2 py-0.5 text-fg-muted"
            title="Estimated from broker name — DLD does not publish broker nationality"
          >
            {broker.nationality_flag} Estimated {broker.detected_nationality} broker
          </span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
        {broker.gender && <span>👤 {broker.gender}</span>}
        {start && <span>Since {start}</span>}
        {broker.detected_language && (
          <span className="inline-flex items-center gap-1">
            <Languages className="h-3 w-3" strokeWidth={2.5} />
            {broker.detected_language}
          </span>
        )}
        {broker.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" strokeWidth={2.5} />
            {broker.phone}
          </span>
        )}
      </div>
      <div className="mt-3 text-[11px] text-fg-subtle">
        License #{broker.broker_number} · ends{' '}
        <span className="font-mono text-fg">
          {broker.license_end_date ?? '—'}
        </span>
      </div>
      <button
        type="button"
        onClick={onPick}
        className="mt-3 btn-primary inline-flex items-center justify-center gap-1.5 h-9 text-xs"
      >
        Request Consultation
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SECTION 5 — Top companies leaderboard
// ---------------------------------------------------------------------------

function TopCompanies({
  items,
  onPickFirm,
}: {
  items: TopCompanyItem[];
  onPickFirm: (firm: string) => void;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-fg">
          Largest Broker Firms in Dubai
        </h2>
      </div>
      <ol className="mt-3 divide-y divide-border/60 border border-border rounded-md overflow-hidden">
        {items.map((c, i) => (
          <li
            key={c.real_estate_name}
            className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-bg-elev/40"
          >
            <span className="text-fg-subtle tabular text-right">#{i + 1}</span>
            <span className="text-fg truncate" title={c.real_estate_name}>
              {c.real_estate_name}
            </span>
            <span className="text-fg-muted text-[11px] tabular">
              {c.active_broker_count.toLocaleString()} active
            </span>
            <button
              type="button"
              onClick={() => onPickFirm(c.real_estate_name)}
              className="text-[11px] text-accent hover:underline"
            >
              View Brokers →
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SECTION 6 — RERA verification info box
// ---------------------------------------------------------------------------

function ReraInfoBox({ lastUpdated }: { lastUpdated?: string }) {
  return (
    <section className="rounded-lg border border-accent/30 bg-accent/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <BadgeCheck
          className="h-5 w-5 text-accent shrink-0 mt-0.5"
          strokeWidth={2}
        />
        <div>
          <h2 className="text-sm font-semibold text-fg">
            What is RERA Verification?
          </h2>
          <p className="mt-1 text-xs text-fg-muted leading-relaxed">
            Every broker in Dubai must hold a valid RERA license issued by the
            Dubai Land Department. All brokers shown here are verified against
            the official DLD broker registry — the authoritative source for
            licensed real-estate professionals in Dubai.{' '}
            <span className="text-fg-subtle">
              Last verified: {lastUpdated ?? '2026-06-01'}.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SECTION 7 — Filters (collapsible on mobile)
// ---------------------------------------------------------------------------

function BrowseFilters({
  q,
  setQ,
  firm,
  setFirm,
  active,
  setActive,
  gender,
  setGender,
  nationality,
  setNationality,
  sortBy,
  setSortBy,
}: {
  q: string;
  setQ: (v: string) => void;
  firm: string;
  setFirm: (v: string) => void;
  active: 'active' | 'expiring' | 'all';
  setActive: (v: 'active' | 'expiring' | 'all') => void;
  gender: 'all' | 'male' | 'female';
  setGender: (v: 'all' | 'male' | 'female') => void;
  nationality: string;
  setNationality: (v: string) => void;
  sortBy: 'name' | 'firm';
  setSortBy: (v: 'name' | 'firm') => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section id="broker-browse" className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">Browse all RERA brokers</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-accent hover:underline sm:hidden"
        >
          {open ? 'Hide filters' : 'Show filters'}
        </button>
      </div>

      <div className={cn('mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5', !open && 'hidden sm:grid')}>
        <div>
          <label
            htmlFor="filter_q"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Name
          </label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <input
              id="filter_q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Ahmed"
              className="input-field pl-9 min-h-[40px]"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="filter_firm"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
          >
            Firm
          </label>
          <input
            id="filter_firm"
            type="search"
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
            placeholder="e.g. Luxfolio"
            className="input-field mt-1 min-h-[40px]"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            License
          </label>
          <select
            value={active}
            onChange={(e) =>
              setActive(e.target.value as 'active' | 'expiring' | 'all')
            }
            className="input-field mt-1 min-h-[40px]"
          >
            <option value="active">Active</option>
            <option value="all">All (incl. expired)</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="filter_nationality"
            className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
            title="Estimated from broker name — DLD does not publish nationality"
          >
            Nationality (est.)
          </label>
          <select
            id="filter_nationality"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="input-field mt-1 min-h-[40px]"
          >
            <option value="all">All</option>
            <option value="Emirati">🇦🇪 Emirati</option>
            <option value="Arab">🌍 Arab</option>
            <option value="Indian">🇮🇳 Indian</option>
            <option value="Pakistani">🇵🇰 Pakistani</option>
            <option value="Russian">🇷🇺 Russian</option>
            <option value="British">🇬🇧 British</option>
            <option value="Filipino">🇵🇭 Filipino</option>
            <option value="Chinese">🇨🇳 Chinese</option>
            <option value="Egyptian">🇪🇬 Egyptian</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
            Sort / Gender
          </label>
          <div className="mt-1 flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'firm')}
              className="input-field min-h-[40px] flex-1"
            >
              <option value="name">Sort A–Z</option>
              <option value="firm">Sort by Firm</option>
            </select>
            <select
              value={gender}
              onChange={(e) =>
                setGender(e.target.value as 'all' | 'male' | 'female')
              }
              className="input-field min-h-[40px] flex-1"
            >
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Browse list with cards
// ---------------------------------------------------------------------------

function BrokerBrowseList({
  items,
  loading,
  total,
  page,
  onPage,
  onPick,
  sortBy,
}: {
  items: DldBrokerItem[];
  loading: boolean;
  total: number;
  page: number;
  onPage: (p: number) => void;
  onPick: (b: DldBrokerItem) => void;
  sortBy: 'name' | 'firm';
}) {
  const showFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min(total, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sorted = useMemo(() => {
    if (sortBy === 'firm') {
      return [...items].sort((a, b) =>
        (a.real_estate_name ?? '').localeCompare(b.real_estate_name ?? '')
      );
    }
    return items;
  }, [items, sortBy]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 text-[11px] text-fg-subtle">
        <span>
          {loading
            ? 'Loading…'
            : total === 0
              ? 'No brokers match'
              : `Showing ${showFrom.toLocaleString()}–${showTo.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>

      {sorted.length === 0 && !loading ? (
        <div className="card p-8 text-center text-sm text-fg-subtle">
          No brokers match these filters. Try clearing the firm field or
          switching License to &ldquo;All&rdquo;.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((b) => (
            <SimpleBrokerCard
              key={b.broker_number}
              broker={b}
              onPick={() => onPick(b)}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => onPage(Math.max(0, page - 1))}
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
            onClick={() => onPage(page + 1)}
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// SECTION 4 — Consultation request modal
// ---------------------------------------------------------------------------

function ConsultationModal({
  broker,
  onClose,
}: {
  broker: BrokerMatchItem | DldBrokerItem;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState<BudgetBand | ''>('');
  const [goal, setGoal] = useState<BrokerGoal | ''>('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle'
  );
  const [err, setErr] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErr('Please enter your full name.');
      return;
    }
    if (!whatsapp.trim() || whatsapp.trim().length < 4) {
      setErr('Please enter a valid WhatsApp number.');
      return;
    }
    setStatus('loading');
    setErr(null);
    try {
      const res = await brokerConsultation({
        broker_number: broker.broker_number,
        full_name: fullName.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim() || undefined,
        budget_band: budget || undefined,
        goal: goal || undefined,
        message: message.trim() || undefined,
      });
      setStatus('done');
      setConfirmation(res.message);
    } catch (e) {
      setStatus('error');
      setErr(
        e instanceof Error ? e.message : 'Could not send the request. Try again.'
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-bg-card border-t sm:border border-border rounded-t-lg sm:rounded-lg shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg truncate">
              Request consultation
            </div>
            <div className="text-[11px] text-fg-muted truncate">
              from <span className="text-fg">{broker.full_name}</span>
              {broker.real_estate_name ? ` · ${broker.real_estate_name}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-md border border-border hover:bg-bg-elev"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {status === 'done' ? (
          <div className="p-5">
            <div className="rounded border border-positive/40 bg-positive/10 p-4 text-sm text-positive">
              ✅ {confirmation}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 btn-primary w-full h-11 text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="p-4 sm:p-5 space-y-3">
            <Field
              label="Full name"
              required
              value={fullName}
              onChange={setFullName}
              placeholder="As it appears on Emirates ID"
            />
            <Field
              label="WhatsApp number"
              required
              value={whatsapp}
              onChange={setWhatsapp}
              placeholder="+9715XXXXXXXX"
              inputMode="tel"
            />
            <Field
              label="Email (optional)"
              value={email}
              onChange={setEmail}
              type="email"
              placeholder="you@example.com"
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Budget"
                value={budget}
                onChange={(v) => setBudget(v as BudgetBand | '')}
                options={[
                  { value: '', label: 'Select…' },
                  ...BUDGETS.map((b) => ({ value: b.key, label: b.label })),
                ]}
                icon={<Wallet className="h-3 w-3" strokeWidth={2.5} />}
              />
              <Select
                label="Goal"
                value={goal}
                onChange={(v) => setGoal(v as BrokerGoal | '')}
                options={[
                  { value: '', label: 'Select…' },
                  { value: 'buy', label: 'Buy' },
                  { value: 'rent', label: 'Rent' },
                  { value: 'invest', label: 'Invest' },
                  { value: 'sell', label: 'Sell' },
                ]}
                icon={<Briefcase className="h-3 w-3" strokeWidth={2.5} />}
              />
            </div>

            <div>
              <label
                htmlFor="cons_message"
                className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium"
              >
                Message (optional)
              </label>
              <textarea
                id="cons_message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                maxLength={500}
                rows={3}
                placeholder="Anything the broker should know?"
                className="input-field mt-1 min-h-[80px]"
              />
              <div className="mt-0.5 text-[10px] text-fg-subtle text-right">
                {message.length}/500
              </div>
            </div>

            {err && (
              <div className="rounded border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="btn-primary w-full inline-flex items-center justify-center h-11 text-sm"
            >
              {status === 'loading' ? 'Sending…' : 'Send request'}
            </button>

            <p className="text-[10px] text-fg-subtle text-center">
              By submitting, you allow this RERA-licensed broker to contact you
              via WhatsApp.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small form primitives
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal';
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label} {required && <span className="text-negative">*</span>}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="input-field mt-1 min-h-[44px]"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="input-field mt-1 min-h-[44px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Unused imports kept stable for hot reload — suppress lint
void Globe;
void Info;
