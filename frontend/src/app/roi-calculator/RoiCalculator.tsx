'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Building2, Calculator, CheckCircle2, ChevronDown, Coins,
  ExternalLink, FileText, Globe, Info, Loader2, Percent, PiggyBank, Printer,
  Receipt, Search, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import { calculateDldRoi } from '@/lib/api';
import { formatAED, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MetricTooltip } from '@/components/MetricTooltip';
import type {
  RoiCalcRequest, RoiCalcResponse, RoiPaymentType,
} from '@/lib/types';

const PROPERTY_TYPES: { value: RoiCalcRequest['property_type']; label: string; suggestedSqm: number }[] = [
  { value: 'studio', label: 'Studio', suggestedSqm: 45 },
  { value: '1br', label: '1 Bed', suggestedSqm: 75 },
  { value: '2br', label: '2 Bed', suggestedSqm: 115 },
  { value: '3br', label: '3 Bed', suggestedSqm: 175 },
  { value: '4br', label: '4+ Bed', suggestedSqm: 250 },
];

interface Props {
  areaOptions: { name: string; name_norm: string }[];
}

export function RoiCalculator({ areaOptions }: Props) {
  const [areaName, setAreaName] = useState<string>(
    areaOptions.find((o) => o.name === 'Business Bay')?.name || areaOptions[0]?.name || ''
  );
  const [propertyType, setPropertyType] = useState<RoiCalcRequest['property_type']>('1br');
  const [sizeSqm, setSizeSqm] = useState<number>(75);
  const [purchasePrice, setPurchasePrice] = useState<number>(1_200_000);
  const [payment, setPayment] = useState<RoiPaymentType>('cash');
  const [downPct, setDownPct] = useState<number>(20);
  const [ratePct, setRatePct] = useState<number>(5);
  const [termYears, setTermYears] = useState<number>(25);
  const [rentInput, setRentInput] = useState<string>('');
  const [serviceCharge, setServiceCharge] = useState<string>('');
  const [maintenancePct, setMaintenancePct] = useState<number>(1);
  const [mgmtPct, setMgmtPct] = useState<number>(0);
  const [vacancyPct, setVacancyPct] = useState<number>(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [result, setResult] = useState<RoiCalcResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const body: RoiCalcRequest = {
        area_name: areaName,
        property_type: propertyType,
        size_sqm: sizeSqm,
        purchase_price_aed: purchasePrice,
        payment,
        ...(payment === 'mortgage' && {
          mortgage: { down_payment_pct: downPct, interest_rate_pct: ratePct, term_years: termYears },
        }),
        ...(rentInput.trim() && { expected_annual_rent_aed: Number(rentInput) }),
        ...(serviceCharge.trim() && { service_charge_aed_per_sqft: Number(serviceCharge) }),
        maintenance_pct: maintenancePct,
        property_management_pct: mgmtPct,
        vacancy_rate_pct: vacancyPct,
      };
      const r = await calculateDldRoi(body);
      setResult(r);
      window.requestAnimationFrame(() => {
        document.getElementById('roi-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  // Property-type → size suggestion (only when user changes type, never overrides typed size)
  const lastTypeRef = useRef(propertyType);
  useEffect(() => {
    if (lastTypeRef.current !== propertyType) {
      const t = PROPERTY_TYPES.find((p) => p.value === propertyType);
      if (t) setSizeSqm(t.suggestedSqm);
      lastTypeRef.current = propertyType;
    }
  }, [propertyType]);

  return (
    <div className="space-y-5 pb-16">
      <div className="grid gap-5 lg:grid-cols-12">
        {/* ============ INPUT FORM ============ */}
        <div className="lg:col-span-5 border border-border rounded-lg bg-bg-card h-fit">
          <div className="chart-header">
            <span className="chart-header-label inline-flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
              Property details
            </span>
          </div>
          <div className="p-5 space-y-4">
            <AreaCombo value={areaName} onChange={setAreaName} options={areaOptions} />

            <div>
              <Label>Property type</Label>
              <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-5 gap-1">
                {PROPERTY_TYPES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPropertyType(p.value)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                      propertyType === p.value
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-border bg-bg-elev/50 text-fg-muted hover:text-fg'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-fg-subtle">
                Size auto-suggests; override below.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Size (sqm)"
                value={sizeSqm}
                onChange={setSizeSqm}
                step={5}
                min={20}
                hint={`~${formatNumber(sizeSqm * 10.7639, 0)} sqft`}
              />
              <NumberField
                label="Purchase price (AED)"
                value={purchasePrice}
                onChange={setPurchasePrice}
                step={50_000}
                min={100_000}
                hint={formatAED(purchasePrice, { compact: true })}
              />
            </div>

            <div>
              <Label>Payment</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {(['cash', 'mortgage'] as RoiPaymentType[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPayment(p)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs font-medium capitalize',
                      payment === p
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-border bg-bg-elev/50 text-fg-muted hover:text-fg'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {payment === 'mortgage' && (
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border/50 bg-bg-elev/20 p-3">
                <NumberField label="Down %" value={downPct} onChange={setDownPct} step={5} min={15} max={80} />
                <NumberField label="Rate %" value={ratePct} onChange={setRatePct} step={0.25} min={1} max={15} />
                <NumberField label="Term yrs" value={termYears} onChange={setTermYears} step={1} min={5} max={30} />
              </div>
            )}

            <div>
              <Label>
                Expected annual rent (AED){' '}
                <span className="normal-case text-fg-subtle text-[10px]">— blank = DLD median</span>
              </Label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="auto from DLD median"
                value={rentInput}
                onChange={(e) => setRentInput(e.target.value)}
                className="input-field mt-1.5 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[11px] text-accent hover:text-accent/80 inline-flex items-center gap-1"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', showAdvanced && 'rotate-180')} strokeWidth={2.5} />
              {showAdvanced ? 'Hide' : 'Show'} advanced (service charge, maintenance, vacancy)
            </button>
            {showAdvanced && (
              <div className="space-y-3 rounded-md border border-border/50 bg-bg-elev/20 p-3">
                <div>
                  <Label>Service charge (AED/sqft)</Label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="default 15"
                    value={serviceCharge}
                    onChange={(e) => setServiceCharge(e.target.value)}
                    className="input-field mt-1 text-sm tabular"
                  />
                  <p className="mt-0.5 text-[10px] text-fg-subtle">blank = 15 AED/sqft default</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label="Maintenance %" value={maintenancePct} onChange={setMaintenancePct} step={0.5} min={0} max={5} />
                  <NumberField label="Prop. mgmt %" value={mgmtPct} onChange={setMgmtPct} step={1} min={0} max={20} />
                  <NumberField label="Vacancy %" value={vacancyPct} onChange={setVacancyPct} step={1} min={0} max={30} />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={calculate}
              disabled={loading || !areaName || sizeSqm <= 0 || purchasePrice <= 0}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />Calculating…</>
              ) : (
                <><Calculator className="h-4 w-4" strokeWidth={2.5} />Calculate ROI</>
              )}
            </button>
            {error && <p className="text-[11px] text-negative">Error: {error}</p>}
          </div>
        </div>

        {/* ============ RESULTS ============ */}
        <div className="lg:col-span-7 space-y-5" id="roi-results">
          {!result ? (
            <div className="border border-border rounded-lg bg-bg-card p-10 text-center">
              <h3 className="text-base font-semibold text-fg">12-section ROI ready when you are</h3>
              <p className="mt-1.5 text-xs text-fg-muted max-w-md mx-auto">
                Investment summary, rental returns, capital growth, payback,
                vs-market benchmarks, scenarios, sensitivity, Dubai tax
                advantages, multi-currency, AI insight.
              </p>
              <p className="mt-3 text-[10px] text-fg-subtle">
                Defaults auto-fill from real DLD data for the selected area.
              </p>
            </div>
          ) : (
            <Results r={result} />
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Results
// ===========================================================================

function Results({ r }: { r: RoiCalcResponse }) {
  const usedDefault = Object.keys(r.defaults_used).length > 0;
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-fg">
            {r.area_name} · {r.property_type.toUpperCase()} · {formatNumber(r.size_sqm, 0)} sqm
          </h2>
          <p className="text-[11px] text-fg-muted">
            {formatAED(r.purchase_price_aed)} · {r.payment === 'mortgage' ? 'Mortgage' : 'Cash'}
            {usedDefault && (
              <span className="ml-2 pill pill-accent text-[10px]">
                {Object.keys(r.defaults_used).length} field(s) auto-filled from DLD
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-[11px] text-fg-muted hover:text-fg hover:border-accent/40"
        >
          <Printer className="h-3 w-3" strokeWidth={2} />
          Print / PDF
        </button>
      </div>

      <Section icon={<Wallet className="h-3.5 w-3.5" />} title="Investment summary" num={1}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KPI label="Total cash needed" value={formatAED(r.total_cash_needed_aed)} accent />
          <KPI label="Total inv. (inc. costs)" value={formatAED(r.total_investment_inc_costs_aed)} />
          <KPI label="Buying costs" value={formatAED(r.cost_breakdown.total_buying_cost_aed)} />
        </div>
        <details className="mt-3 group">
          <summary className="text-[11px] text-fg-subtle cursor-pointer hover:text-fg-muted inline-flex items-center gap-1">
            <Info className="h-3 w-3" strokeWidth={2} />
            Cost breakdown
          </summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] tabular">
            <Row label="DLD transfer (4%)" value={formatAED(r.cost_breakdown.dld_transfer_aed)} />
            <Row label="Agency (2%)" value={formatAED(r.cost_breakdown.agency_aed)} />
            <Row label="Agency VAT (5%)" value={formatAED(r.cost_breakdown.agency_vat_aed)} />
            <Row label="Trustee" value={formatAED(r.cost_breakdown.trustee_aed)} />
            {r.cost_breakdown.mortgage_registration_aed > 0 && (
              <Row label="Mortgage reg. (0.25%)" value={formatAED(r.cost_breakdown.mortgage_registration_aed)} />
            )}
          </div>
        </details>
      </Section>

      <Section icon={<Coins className="h-3.5 w-3.5" />} title="Rental returns" num={2}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Gross yield" tooltip="Gross Yield" value={`${r.rental_returns.gross_yield_pct.toFixed(2)}%`} accent />
          <KPI
            label="Net yield"
            tooltip="Net Yield"
            value={`${r.rental_returns.net_yield_pct.toFixed(2)}%`}
            tone={r.rental_returns.net_yield_pct >= 6 ? 'positive' : r.rental_returns.net_yield_pct >= 4 ? 'neutral' : 'negative'}
          />
          <KPI label="Gross rent" value={formatAED(r.rental_returns.gross_rent_aed)} />
          <KPI label="Net rent" value={formatAED(r.rental_returns.net_rent_aed)} />
        </div>
        {r.rental_returns.annual_cash_flow_aed != null && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <KPI
              label="Monthly cash flow"
              value={formatAED(r.rental_returns.monthly_cash_flow_aed ?? 0)}
              tone={(r.rental_returns.monthly_cash_flow_aed ?? 0) > 0 ? 'positive' : 'negative'}
            />
            <KPI
              label="Annual cash flow"
              value={formatAED(r.rental_returns.annual_cash_flow_aed)}
              tone={r.rental_returns.annual_cash_flow_aed > 0 ? 'positive' : 'negative'}
            />
          </div>
        )}
        <p className="mt-2 text-[10px] text-fg-subtle">
          Operating expenses: {formatAED(r.rental_returns.operating_expenses_aed)}/year
          (service charge + maintenance + management + vacancy)
        </p>
      </Section>

      <Section icon={<TrendingUp className="h-3.5 w-3.5" />} title="Capital growth (5y projection)" num={3}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Current value" value={formatAED(r.capital_growth.current_value_aed, { compact: true })} />
          <KPI label="Projected (5y)" value={formatAED(r.capital_growth.projected_value_5y_aed, { compact: true })} accent />
          <KPI
            label="CAGR used"
            value={`${r.capital_growth.cagr_pct_used.toFixed(1)}%`}
            sublabel={r.capital_growth.cagr_source}
          />
          <KPI
            label="Total 5y return"
            value={`${r.capital_growth.total_5y_return_pct.toFixed(0)}%`}
            sublabel={formatAED(r.capital_growth.total_5y_return_aed, { compact: true })}
            tone="positive"
          />
        </div>
        {r.capital_growth.irr_estimate_pct != null && (
          <p className="mt-2 text-[11px] text-fg-muted">
            IRR estimate: <span className="tabular text-fg">{r.capital_growth.irr_estimate_pct.toFixed(1)}%/yr</span> (rent + appreciation, even cash-flow approximation)
          </p>
        )}
      </Section>

      <Section icon={<PiggyBank className="h-3.5 w-3.5" />} title="Payback period" num={4} tooltip="Payback Period">
        {r.payback_years != null ? (
          <div className="text-2xl font-semibold tabular text-fg">
            {r.payback_years.toFixed(1)}<span className="text-sm text-fg-muted ml-1">years</span>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">Insufficient rent to compute payback</p>
        )}
        <p className="mt-1 text-[11px] text-fg-muted">From net rent alone (excludes appreciation)</p>
      </Section>

      <Section icon={<Sparkles className="h-3.5 w-3.5" />} title="vs Area benchmarks" num={5}>
        <div className="grid grid-cols-2 gap-3">
          <BenchmarkCard
            label="Your yield"
            yourValue={`${r.yield_vs_market.your_value.toFixed(2)}%`}
            areaMedian={r.yield_vs_market.area_median != null ? `${r.yield_vs_market.area_median.toFixed(2)}%` : '—'}
            verdict={r.yield_vs_market.verdict}
          />
          <BenchmarkCard
            label="Your AED/sqft"
            yourValue={formatNumber(r.price_vs_market.your_value, 0)}
            areaMedian={r.price_vs_market.area_median != null ? formatNumber(r.price_vs_market.area_median, 0) : '—'}
            verdict={r.price_vs_market.verdict}
          />
        </div>
      </Section>

      <Section icon={<Receipt className="h-3.5 w-3.5" />} title="3 rent scenarios" num={6}>
        <div className="grid grid-cols-3 gap-2">
          {r.scenarios.map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-bg-elev/20 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{s.label}</div>
              <div className="mt-1 text-lg font-semibold tabular text-fg">{s.net_yield_pct.toFixed(2)}%</div>
              <div className="text-[10px] text-fg-muted">{formatAED(s.annual_rent_aed, { compact: true })}/yr</div>
              {s.annual_cash_flow_aed != null && (
                <div className={cn(
                  'mt-1 text-[10px] tabular',
                  s.annual_cash_flow_aed >= 0 ? 'text-positive' : 'text-negative'
                )}>
                  CF: {formatAED(s.annual_cash_flow_aed, { compact: true })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Percent className="h-3.5 w-3.5" />} title="Sensitivity analysis" num={7}>
        <ul className="space-y-1.5 text-xs">
          {r.sensitivity.map((s, i) => (
            <li key={i} className="flex items-start gap-2 border-b border-border/40 pb-1.5 last:border-0">
              <span className="font-medium text-fg w-32 shrink-0">{s.scenario}</span>
              <span className="text-fg-muted flex-1">{s.note}</span>
              {s.delta_annual_cash_flow_aed != null && (
                <span className={cn(
                  'tabular text-[11px]',
                  s.delta_annual_cash_flow_aed >= 0 ? 'text-positive' : 'text-negative'
                )}>
                  {s.delta_annual_cash_flow_aed >= 0 ? '+' : ''}{formatNumber(s.delta_annual_cash_flow_aed, 0)} AED/yr
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<CheckCircle2 className="h-3.5 w-3.5" />} title="Dubai tax advantages" num={8}>
        <ul className="space-y-1 text-xs text-fg-muted">
          {r.tax_advantages.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-3 w-3 text-positive shrink-0 mt-0.5" strokeWidth={2.5} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-border pt-2 text-[11px]">
          <span className="text-fg-muted">Effective net yield after tax: </span>
          <span className="tabular text-fg font-semibold">{r.effective_net_yield_after_tax_pct.toFixed(2)}%</span>
          <span className="text-fg-subtle"> (same as gross — zero income tax)</span>
        </div>
      </Section>

      <Section icon={<Globe className="h-3.5 w-3.5" />} title="Multi-currency snapshot" num={9}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {r.currencies.map((c) => (
            <div key={c.code} className="rounded-md border border-border bg-bg-elev/20 p-2.5">
              <div className="text-[10px] text-fg-subtle">{c.code}</div>
              <div className="mt-0.5 text-sm font-medium tabular text-fg">
                {c.symbol}{formatNumber(c.price_local, 0)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-fg-subtle italic">{r.fx_rates_disclaimer}</p>
      </Section>

      <Section icon={<Sparkles className="h-3.5 w-3.5 text-accent" />} title="AI insight" num={10}>
        <p className="text-sm text-fg leading-relaxed">{r.insight.summary}</p>
        {r.insight.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-xs text-fg-muted">
            {r.insight.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="border border-border rounded-lg bg-bg-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-fg-muted">
          <FileText className="h-3.5 w-3.5 inline mr-1.5 text-fg-subtle" strokeWidth={2} />
          Save as PDF via your browser&apos;s print dialog
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/brokers/directory?area=${encodeURIComponent(r.area_name)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg hover:bg-accent/90"
          >
            <Building2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            Find a broker
            <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
          </Link>
          <Link
            href={`/buildings?area=${encodeURIComponent(r.area_name)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-accent/40"
          >
            Browse buildings
            <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
          </Link>
          <Link
            href={`/areas`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-accent/40"
          >
            Compare areas
          </Link>
        </div>
      </div>

      <div className="text-[10px] text-fg-subtle text-center">
        Powered by Dubai Land Department open data — every number traceable. Last updated {r.last_updated}.
      </div>
    </>
  );
}

// ===========================================================================
// Reusable bits
// ===========================================================================

function Section({
  icon, title, num, children, tooltip,
}: {
  icon: React.ReactNode;
  title: string;
  num: number;
  children: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-fg">
          <span className="text-fg-subtle">{icon}</span>
          {title}
          {tooltip && <MetricTooltip metric={tooltip} />}
        </span>
        <span className="text-[10px] text-fg-subtle tabular">§{num}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function KPI({
  label, value, sublabel, accent, tone, tooltip,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
  tooltip?: string;
}) {
  const tc =
    tone === 'positive' ? 'text-positive' :
    tone === 'negative' ? 'text-negative' :
    accent ? 'text-accent' : 'text-fg';
  return (
    <div className="rounded-md border border-border bg-bg-elev/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle inline-flex items-center">
        {label}
        {tooltip && <MetricTooltip metric={tooltip} />}
      </div>
      <div className={cn('mt-1 text-base font-semibold tabular', tc)}>{value}</div>
      {sublabel && <div className="text-[10px] text-fg-subtle mt-0.5">{sublabel}</div>}
    </div>
  );
}

function BenchmarkCard({
  label, yourValue, areaMedian, verdict,
}: {
  label: string;
  yourValue: string;
  areaMedian: string;
  verdict: string;
}) {
  const tone =
    verdict.includes('above area average') || verdict.includes('potential value')
      ? 'positive'
      : verdict.includes('below area average') || verdict.includes('above area median')
        ? 'negative'
        : 'neutral';
  return (
    <div className="rounded-md border border-border bg-bg-elev/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-base font-semibold tabular text-fg">{yourValue}</span>
        <span className="text-[10px] text-fg-subtle">vs area {areaMedian}</span>
      </div>
      <div className={cn(
        'mt-1 text-[10px]',
        tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg-muted'
      )}>
        {verdict}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-0.5">
      <span className="text-fg-muted">{label}</span>
      <span className="tabular text-fg">{value}</span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
      {children}
    </label>
  );
}

function NumberField({
  label, value, onChange, step = 1, min, max, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-field mt-1 text-sm tabular"
      />
      {hint && <p className="mt-0.5 text-[10px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

// ===========================================================================
// Area combobox — searches all 284 canonical areas
// ===========================================================================

function AreaCombo({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { name: string; name_norm: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 120);
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative">
      <Label>Area</Label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-bg-card px-3 py-2 text-left text-sm min-h-[40px]"
      >
        <span className="truncate text-fg">{value || 'Pick an area'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-fg-subtle transition-transform', open && 'rotate-180')} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-bg-card shadow-lg max-h-[50vh] overflow-hidden flex flex-col">
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle" strokeWidth={2} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all 284 canonical areas…"
              autoFocus
              className="w-full bg-transparent pl-9 pr-3 py-2 text-sm outline-none"
            />
          </div>
          <ul className="overflow-y-auto py-1">
            {filtered.map((o) => (
              <li key={o.name_norm}>
                <button
                  type="button"
                  onClick={() => { onChange(o.name); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-fg hover:bg-bg-elev"
                >
                  {o.name}
                </button>
              </li>
            ))}
            {!filtered.length && (
              <li className="px-3 py-3 text-[11px] text-fg-subtle">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
