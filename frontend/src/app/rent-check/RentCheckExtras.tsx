'use client';

/**
 * Six post-result feature blocks for /rent-check. The headline verdict,
 * percentile bar, sample/context strip, cheaper-alternatives list, and
 * share row remain in RentCheckClient.tsx. The blocks below append below
 * those, in this order:
 *
 *   1. NegotiationPower      — colored power chip + what landlord can/can't do
 *   2. RERALegalCalculator   — Decree 43 increase bands → max legal new rent
 *   3. RentVsBuy             — 80% LTV / 5% / 25y mortgage vs annual rent
 *   4. BestTimeToNegotiate   — generic seasonality + 90-day notice rule
 *   5. RentAlertSignup       — POST /dld/rent-alerts (email + area + size)
 *
 * (The 7th feature, the enhanced share card, lives in RentCheckClient
 *  as ShareRow — it needs URL deep-link params from the form state.)
 */

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BellRing,
  Calculator,
  CheckCircle2,
  Clock,
  Home,
  Info,
  Scale,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import { createRentAlert } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAED } from '@/lib/format';
import type {
  RentCheckResponse,
  SizeCategory,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Size midpoints used for the buy estimate. Each sqm value is the centre of
// the user-facing bucket, converted to sqft (DLD PPSF is per-sqft).
// ---------------------------------------------------------------------------
const SQM_TO_SQFT = 10.7639;

export const SIZE_MIDPOINT_SQM: Record<SizeCategory, number> = {
  studio: 35,
  '1br': 75,
  '2br': 125,
  '3br': 175,
  '4br': 250,
};

// ---------------------------------------------------------------------------
// 1. Negotiation Power
// ---------------------------------------------------------------------------

interface PowerInfo {
  level: 'weak' | 'neutral_locked' | 'neutral_small' | 'strong' | 'very_strong';
  label: string;
  emoji: string;
  tone: 'negative' | 'warning' | 'positive';
  headline: string;
  can: string;
  cannot: string;
}

function classifyPower(diffPct: number): PowerInfo {
  if (diffPct > 0) {
    return {
      level: 'weak',
      label: 'WEAK',
      emoji: '🔴',
      tone: 'negative',
      headline:
        'You already pay above market. Negotiate down at renewal — bring this report.',
      can: 'Refuse any further increase. RERA forbids raises when you pay ≥10% above median.',
      cannot:
        'Landlord cannot legally demand any increase — they can only seek a decrease petition.',
    };
  }
  const below = Math.abs(diffPct);
  if (below <= 10) {
    return {
      level: 'neutral_locked',
      label: 'NEUTRAL',
      emoji: '🟡',
      tone: 'warning',
      headline:
        'Your rent is fair. Landlord cannot raise it at renewal — this is the RERA "free zone".',
      can: 'Send the standard 90-day renewal notice at the same rent.',
      cannot:
        'Apply any increase while you sit within ±10% of the area median (Decree 43, 2013).',
    };
  }
  if (below <= 20) {
    return {
      level: 'neutral_small',
      label: 'NEUTRAL',
      emoji: '🟡',
      tone: 'warning',
      headline:
        'You pay slightly below market. Landlord may raise by up to 5% at renewal.',
      can: 'Apply a max 5% increase (with 90-day written notice).',
      cannot: 'Demand more than 5% — anything above is unenforceable.',
    };
  }
  if (below <= 30) {
    return {
      level: 'strong',
      label: 'STRONG',
      emoji: '🟢',
      tone: 'positive',
      headline:
        'You have a strong position. Even with the max legal raise, you stay below market.',
      can: 'Apply a max 10% increase (Decree 43 band 21–30% below market).',
      cannot: 'Refuse renewal or skip the 90-day notice.',
    };
  }
  // below > 30
  return {
    level: 'very_strong',
    label: 'VERY STRONG',
    emoji: '🟢',
    tone: 'positive',
    headline:
      "You have an excellent deal. Landlord's max raise is bounded by Decree 43.",
    can: below > 40 ? 'Apply a max 20% increase.' : 'Apply a max 15% increase.',
    cannot: 'Force a higher figure under any circumstances.',
  };
}

export function NegotiationPower({ result }: { result: RentCheckResponse }) {
  const info = classifyPower(result.percentage_diff);
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        <h3 className="text-sm font-semibold text-fg">Your Negotiation Power</h3>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold',
            info.tone === 'positive' && 'bg-positive/15 text-positive',
            info.tone === 'warning' && 'bg-warning/15 text-warning',
            info.tone === 'negative' && 'bg-negative/15 text-negative'
          )}
        >
          <span aria-hidden>{info.emoji}</span>
          {info.label}
        </span>
        <span className="text-[11px] text-fg-subtle">
          Based on RERA Decree No. 43 of 2013
        </span>
      </div>
      <p className="mt-3 text-sm text-fg">{info.headline}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-positive/30 bg-positive/5 p-3">
          <div className="text-[10px] uppercase tracking-wide font-medium text-positive flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
            Landlord CAN
          </div>
          <p className="mt-1 text-xs text-fg-muted">{info.can}</p>
        </div>
        <div className="rounded border border-negative/30 bg-negative/5 p-3">
          <div className="text-[10px] uppercase tracking-wide font-medium text-negative flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
            Landlord CANNOT
          </div>
          <p className="mt-1 text-xs text-fg-muted">{info.cannot}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. RERA Legal Rent Calculator (Decree 43)
// ---------------------------------------------------------------------------

interface LegalBand {
  label: string;
  maxIncreasePct: number;
}

function legalBand(diffPct: number): LegalBand {
  // diffPct is signed: positive = user pays above market.
  if (diffPct >= -10) return { label: 'Within ±10% of market', maxIncreasePct: 0 };
  const below = Math.abs(diffPct);
  if (below <= 20) return { label: '11–20% below market', maxIncreasePct: 5 };
  if (below <= 30) return { label: '21–30% below market', maxIncreasePct: 10 };
  if (below <= 40) return { label: '31–40% below market', maxIncreasePct: 15 };
  return { label: '40%+ below market', maxIncreasePct: 20 };
}

export function RERALegalCalculator({ result }: { result: RentCheckResponse }) {
  const band = legalBand(result.percentage_diff);
  const maxNewRent = Math.round(result.user_rent * (1 + band.maxIncreasePct / 100));
  const increaseAmount = maxNewRent - result.user_rent;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        <h3 className="text-sm font-semibold text-fg">Maximum Legal Rent Increase</h3>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Tile label="Current rent" value={formatAED(result.user_rent)} />
        <Tile label="Area median (RERA index)" value={formatAED(result.area_median)} sub={`Size ${result.size_band} sqm`} />
        <Tile
          label="Position vs market"
          value={`${result.percentage_diff >= 0 ? '+' : ''}${result.percentage_diff.toFixed(1)}%`}
          sub={band.label}
        />
      </div>
      <div
        className={cn(
          'mt-4 rounded border p-4',
          band.maxIncreasePct === 0
            ? 'border-positive/40 bg-positive/5'
            : 'border-accent/40 bg-accent/5'
        )}
      >
        <div className="text-[11px] uppercase tracking-wide font-medium text-fg-subtle">
          Max legal increase under Decree 43
        </div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl sm:text-3xl font-semibold tabular text-fg">
            {band.maxIncreasePct}%
          </span>
          {band.maxIncreasePct > 0 ? (
            <span className="text-sm text-fg-muted tabular">
              → up to{' '}
              <span className="font-semibold text-fg">{formatAED(maxNewRent)}</span>
              {' '}({increaseAmount > 0 && '+'}{formatAED(increaseAmount)})
            </span>
          ) : (
            <span className="text-sm text-positive font-medium">
              ✅ No increase allowed
            </span>
          )}
        </div>
      </div>

      {band.maxIncreasePct > 0 && (
        <div className="mt-3 rounded border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          <div className="font-semibold">⚠️ If the landlord demands more than {formatAED(maxNewRent)}, that increase exceeds the RERA cap.</div>
          <div className="mt-1 text-fg-muted">
            Show your landlord the calculator above, then{' '}
            <Link
              href="/brokers/directory"
              className="text-accent underline"
            >
              consult a RERA-licensed broker
            </Link>{' '}
            if you need help negotiating.
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-fg-subtle flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 shrink-0" strokeWidth={2} />
        Landlord must give 90 days written notice before any renewal change. The
        RERA index here is the DLD area median for your size band.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Rent vs Buy
// ---------------------------------------------------------------------------

interface RentVsBuyProps {
  result: RentCheckResponse;
  sizeCategory: SizeCategory;
  areaDisplayName: string;
}

function monthlyMortgage(principal: number, annualRate: number, years: number): number {
  const n = years * 12;
  const r = annualRate / 12;
  if (r === 0) return principal / n;
  const pow = Math.pow(1 + r, n);
  return (principal * r * pow) / (pow - 1);
}

export function RentVsBuy({ result, sizeCategory, areaDisplayName }: RentVsBuyProps) {
  const ppsf = result.median_price_per_sqft ?? result.avg_price_per_sqft;
  if (!ppsf) {
    return (
      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-fg-muted" strokeWidth={2} />
          <h3 className="text-sm font-semibold text-fg">Rent vs Buy in {areaDisplayName}</h3>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          Not enough recent sales transactions in this area to estimate a purchase price. Try another area or check our{' '}
          <a className="text-accent underline" href="/areas">areas screener</a>.
        </p>
      </section>
    );
  }

  const sqft = SIZE_MIDPOINT_SQM[sizeCategory] * SQM_TO_SQFT;
  const estimatedPrice = ppsf * sqft;
  const downPaymentPct = 0.20;
  const principal = estimatedPrice * (1 - downPaymentPct);
  const monthly = monthlyMortgage(principal, 0.05, 25);
  const annualMortgage = monthly * 12;
  const annualRent = result.user_rent;
  const diff = annualRent - annualMortgage;
  const buyingWins = diff > 0;
  const paybackYears = diff > 0 ? estimatedPrice / diff : null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        <h3 className="text-sm font-semibold text-fg">
          Rent vs Buy in {areaDisplayName}
        </h3>
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">
        Assumes a {Math.round(SIZE_MIDPOINT_SQM[sizeCategory])} sqm unit, 20%
        down, 5% rate, 25-year mortgage. Real numbers vary by lender + unit.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Tile label="Estimated unit price" value={formatAED(estimatedPrice)} sub={`@ ${Math.round(ppsf).toLocaleString()} AED/sqft`} />
        <Tile label="Annual rent" value={formatAED(annualRent)} sub="Your current contract" />
        <Tile label="Annual mortgage" value={formatAED(annualMortgage)} sub="80% LTV · 5% · 25y" />
      </div>

      <div
        className={cn(
          'mt-4 rounded border p-4',
          buyingWins ? 'border-positive/40 bg-positive/5' : 'border-accent/40 bg-accent/5'
        )}
      >
        <div className="text-[11px] uppercase tracking-wide font-medium text-fg-subtle">
          Verdict
        </div>
        <div className="mt-1 text-base sm:text-lg font-semibold text-fg">
          {buyingWins ? (
            <>
              Buying saves <span className="text-positive">{formatAED(Math.abs(diff))}</span>/year
            </>
          ) : (
            <>
              Renting saves <span className="text-accent">{formatAED(Math.abs(diff))}</span>/year
            </>
          )}
        </div>
        {paybackYears && (
          <div className="mt-1 text-xs text-fg-muted">
            Payback period (rent saved vs full purchase):{' '}
            <span className="font-mono text-fg">{paybackYears.toFixed(1)} years</span>
          </div>
        )}
      </div>

      {result.area_name_norm && (
        <a
          href={`/dld/areas?q=${encodeURIComponent(result.area_name_norm)}`}
          className="mt-3 btn-secondary inline-flex items-center justify-center gap-1.5 h-10 text-xs"
        >
          Explore investment in {areaDisplayName}
        </a>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Best Time to Negotiate
// ---------------------------------------------------------------------------

export function BestTimeToNegotiate({ result }: { result: RentCheckResponse }) {
  const yoy = result.yoy_trend;
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        <h3 className="text-sm font-semibold text-fg">Best Time to Negotiate</h3>
      </div>
      <ul className="mt-3 space-y-2.5 text-sm text-fg-muted">
        <li className="flex items-start gap-2">
          <span aria-hidden className="mt-0.5">💡</span>
          <span>
            Dubai rent activity dips Jan–March (post-DSF, pre-Ramadan). If your
            contract ends in summer, open the conversation early — landlords
            re-price faster when the market is quiet.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden className="mt-0.5">📅</span>
          <span>
            <span className="text-fg font-medium">90-day rule</span>: any
            renewal change (rent or terms) requires 90 days written notice.
            Send your counter-offer 100+ days before contract end to start the
            clock cleanly.
          </span>
        </li>
        {yoy != null && (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5">
              {yoy >= 0 ? '📈' : '📉'}
            </span>
            <span>
              Area rents are{' '}
              <span
                className={cn(
                  'font-medium',
                  yoy >= 0 ? 'text-positive' : 'text-negative'
                )}
              >
                {yoy >= 0 ? 'up' : 'down'} {Math.abs(yoy).toFixed(1)}%
              </span>{' '}
              year-over-year. {yoy < 0
                ? 'Falling market — push for a hold or a cut.'
                : 'Rising market — lock in a multi-year contract if the landlord agrees.'}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. Rent Alert Signup
// ---------------------------------------------------------------------------

interface RentAlertSignupProps {
  areaNorm: string;
  areaDisplay: string;
  sizeCategory: SizeCategory;
  propSubType: string;
}

export function RentAlertSignup({
  areaNorm,
  areaDisplay,
  sizeCategory,
  propSubType,
}: RentAlertSignupProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setErrMsg('Enter a valid email.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrMsg(null);
    try {
      await createRentAlert({
        email: trimmed,
        area_name_norm: areaNorm,
        area_name_display: areaDisplay,
        size_category: sizeCategory,
        prop_sub_type: propSubType,
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrMsg(
        err instanceof Error ? err.message : 'Could not save alert. Try again.'
      );
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        <h3 className="text-sm font-semibold text-fg">Get Rent Alerts</h3>
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        Notify me when rents change in{' '}
        <span className="font-medium text-fg">{areaDisplay}</span> for{' '}
        <span className="font-medium text-fg">{sizeCategory.toUpperCase()}</span>.
      </p>

      {status === 'done' ? (
        <div className="mt-3 rounded border border-positive/40 bg-positive/10 px-3 py-2.5 text-sm text-positive flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
          ✅ We&apos;ll notify you when rents change in {areaDisplay}.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-field min-h-[44px] flex-1"
            required
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="btn-primary inline-flex items-center justify-center min-h-[44px] px-4 text-sm"
          >
            {status === 'loading' ? 'Saving…' : 'Notify me'}
          </button>
        </form>
      )}

      {status === 'error' && errMsg && (
        <p className="mt-2 text-[11px] text-negative">{errMsg}</p>
      )}

      <p className="mt-2 text-[10px] text-fg-subtle">
        No spam. Unsubscribe anytime.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small shared tile
// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded border border-border bg-bg-elev p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className="mt-1 text-sm sm:text-base font-mono tabular text-fg">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-fg-subtle">{sub}</div>}
    </div>
  );
}

// Re-export icon for the RentCheckClient share row to reuse if needed.
export { TrendingDown, ShieldCheck };
