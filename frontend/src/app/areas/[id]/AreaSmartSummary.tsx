import Link from 'next/link';
import {
  ArrowUpRight,
  Building2,
  Coins,
  Globe2,
  Home,
  TrendingUp,
  Users,
  Sparkles,
} from 'lucide-react';
import type { AreaDetail } from '@/lib/types';
import { formatAED, formatNumber, formatPercent } from '@/lib/format';
import { MetricTooltip } from '@/components/MetricTooltip';
import { cn } from '@/lib/cn';

interface Props {
  area: AreaDetail;
  appreciation5yPct: number | null;
  cagr5yPct: number | null;
  startingPpsf: number | null;
  latestPpsf: number | null;
  marketAvgYieldPct: number;
}

/**
 * Plain-language smart summary block — inserted between the hero strip and
 * the deeper data sections. Every number gets a one-line "what this means"
 * line and a tooltip; everything is derived from data already fetched on
 * /areas/[id]. Sections that lack data simply render fewer tiles instead of
 * empty placeholders.
 */
export function AreaSmartSummary({
  area,
  appreciation5yPct,
  cagr5yPct,
  startingPpsf,
  latestPpsf,
  marketAvgYieldPct,
}: Props) {
  const yieldPct =
    area.dld?.rental_yield_pct ?? area.latest?.rental_yield ?? null;
  const avgPpsf =
    area.dld?.avg_price_per_sqft ??
    area.latest?.avg_price_per_sqft ??
    null;
  const annualRent =
    area.dld?.avg_annual_rent ?? area.latest?.avg_annual_rent ?? null;
  const salesCount = area.dld?.sales_count ?? null;
  const rentGrowthYoy = area.dld?.rent_growth_yoy_pct ?? null;
  const freeholdPct = area.dld?.freehold_pct ?? null;
  const buildingCount = area.dld?.building_count ?? null;

  const verdict = computeVerdict({
    yieldPct,
    appreciation5yPct,
    marketAvgYieldPct,
  });

  return (
    <section className="border-b border-border bg-bg-card/20">
      <div className="px-4 sm:px-6 py-5 space-y-5 max-w-[1280px] mx-auto">
        {/* Quick verdict tagline */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold',
              verdict.tone === 'best' && 'bg-positive/15 text-positive',
              verdict.tone === 'income' && 'bg-accent/15 text-accent',
              verdict.tone === 'growth' && 'bg-accent/15 text-accent',
              verdict.tone === 'emerging' && 'bg-warning/15 text-warning',
            )}
            aria-label="Investor verdict"
          >
            <span aria-hidden>{verdict.emoji}</span>
            {verdict.label}
          </span>
          <span className="text-[11px] text-fg-subtle">
            {verdict.reason}
          </span>
        </div>

        {/* At a Glance — 6 plain-language tiles */}
        <div>
          <h2 className="text-sm font-semibold text-fg tracking-tight mb-2.5 inline-flex items-center">
            At a glance
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <PlainTile
              icon={<Home className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />}
              label="Avg Price"
              tooltip="Transaction Volume"
              headline={
                avgPpsf != null ? `AED ${formatNumber(avgPpsf, 0)}/sqft` : '—'
              }
              caption={
                salesCount
                  ? `Based on ${salesCount.toLocaleString()} sales`
                  : 'Per-sqft average'
              }
            />
            <PlainTile
              icon={<Coins className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />}
              label="Rental Yield"
              tooltip="Gross Yield"
              headline={
                yieldPct != null ? `${yieldPct.toFixed(2)}% gross` : '—'
              }
              caption={
                yieldPct != null
                  ? `≈ AED ${formatNumber(yieldPct * 10_000, 0)}/yr on AED 1M`
                  : 'Annual rent ÷ price'
              }
              tone={
                yieldPct != null && yieldPct >= 7
                  ? 'positive'
                  : yieldPct != null && yieldPct >= 5
                    ? 'accent'
                    : 'default'
              }
            />
            <PlainTile
              icon={<TrendingUp className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />}
              label="5Y Growth"
              tooltip="5Y Appreciation"
              headline={
                appreciation5yPct != null
                  ? `${appreciation5yPct >= 0 ? '+' : ''}${appreciation5yPct.toFixed(0)}% since 2021`
                  : '—'
              }
              caption={
                startingPpsf && latestPpsf
                  ? `AED ${formatNumber(startingPpsf, 0)} → AED ${formatNumber(latestPpsf, 0)}/sqft`
                  : cagr5yPct != null
                    ? `${cagr5yPct >= 0 ? '+' : ''}${cagr5yPct.toFixed(1)}% per year (CAGR)`
                    : 'Price growth 2021–2026'
              }
              tone={
                appreciation5yPct != null && appreciation5yPct >= 100
                  ? 'positive'
                  : appreciation5yPct != null && appreciation5yPct >= 50
                    ? 'accent'
                    : 'default'
              }
            />
            <PlainTile
              icon={<Sparkles className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />}
              label="Avg Rent"
              tooltip="Rent Growth YoY"
              headline={
                annualRent != null ? `${formatAED(annualRent)}/yr` : '—'
              }
              caption={
                annualRent != null
                  ? `≈ AED ${formatNumber(annualRent / 12, 0)}/month`
                  : 'Annual rent average'
              }
            />
            <PlainTile
              icon={<Building2 className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />}
              label="Active Supply"
              tooltip="Supply Risk"
              headline={
                buildingCount != null
                  ? `${buildingCount.toLocaleString()} buildings`
                  : '—'
              }
              caption={
                buildingCount == null
                  ? 'Tracked supply'
                  : buildingCount < 20
                    ? 'Low — limited new supply'
                    : buildingCount < 80
                      ? 'Healthy supply'
                      : 'Dense supply — watch rents'
              }
              tone={
                buildingCount != null && buildingCount < 80
                  ? 'positive'
                  : 'default'
              }
            />
            <PlainTile
              icon={<Globe2 className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />}
              label="Ownership"
              tooltip="Freehold"
              headline={
                freeholdPct == null
                  ? 'See land registry'
                  : freeholdPct >= 80
                    ? 'Freehold — foreigners 100%'
                    : freeholdPct >= 30
                      ? 'Mixed freehold / leasehold'
                      : 'Mostly leasehold'
              }
              caption={
                freeholdPct != null
                  ? `${freeholdPct.toFixed(1)}% of parcels are freehold`
                  : 'Foreign-ownership status'
              }
              tone={
                freeholdPct != null && freeholdPct >= 80 ? 'positive' : 'default'
              }
            />
          </div>
          <p className="mt-2 text-[10px] text-fg-subtle">
            Source: Dubai Land Department · live snapshot
          </p>
        </div>

        {/* Investor matching cards */}
        <div>
          <h2 className="text-sm font-semibold text-fg tracking-tight mb-2.5">
            Is this area right for you?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InvestorCard
              icon={<Coins className="h-4 w-4 text-accent" strokeWidth={2} />}
              title="Income Investor"
              fit={
                yieldPct != null && marketAvgYieldPct
                  ? yieldPct > marketAvgYieldPct + 1
                    ? 'strong'
                    : yieldPct > marketAvgYieldPct - 0.5
                      ? 'good'
                      : 'weak'
                  : 'unknown'
              }
              body={
                yieldPct != null
                  ? `Yield ${yieldPct.toFixed(2)}% — Dubai avg is ${marketAvgYieldPct.toFixed(2)}%. Great for monthly cash-flow focus.`
                  : 'Yield data limited — sample size below threshold.'
              }
              ctaLabel="Calculate my ROI"
              ctaHref={`/roi-calculator?area=${encodeURIComponent(area.dld?.dld_name?.toLowerCase() ?? area.name.toLowerCase())}`}
            />
            <InvestorCard
              icon={<TrendingUp className="h-4 w-4 text-accent" strokeWidth={2} />}
              title="Growth Investor"
              fit={
                appreciation5yPct != null
                  ? appreciation5yPct >= 100
                    ? 'strong'
                    : appreciation5yPct >= 50
                      ? 'good'
                      : appreciation5yPct >= 0
                        ? 'weak'
                        : 'weak'
                  : 'unknown'
              }
              body={
                appreciation5yPct != null
                  ? `${appreciation5yPct >= 0 ? '+' : ''}${appreciation5yPct.toFixed(0)}% over 5 years. ${
                      salesCount ? `${salesCount.toLocaleString()} sales/yr means good exit liquidity.` : ''
                    }`
                  : 'Price-history coverage limited — see history section below.'
              }
              ctaLabel="See price history"
              ctaHref="#price-history"
            />
            <InvestorCard
              icon={<Users className="h-4 w-4 text-accent" strokeWidth={2} />}
              title="End User / Family"
              fit={annualRent != null ? 'good' : 'unknown'}
              body={
                annualRent != null
                  ? `Rent ~AED ${formatNumber(annualRent / 12, 0)}/month here. ${
                      rentGrowthYoy != null
                        ? `${rentGrowthYoy >= 0 ? '+' : ''}${rentGrowthYoy.toFixed(1)}% YoY rent.`
                        : ''
                    }`
                  : 'Rental data limited.'
              }
              ctaLabel="Find a broker"
              ctaHref={`/brokers/directory?area=${encodeURIComponent(area.dld?.dld_name?.toLowerCase() ?? area.name.toLowerCase())}`}
            />
            <InvestorCard
              icon={<Globe2 className="h-4 w-4 text-accent" strokeWidth={2} />}
              title="Foreign Investor"
              fit={
                freeholdPct == null
                  ? 'unknown'
                  : freeholdPct >= 80
                    ? 'strong'
                    : freeholdPct >= 30
                      ? 'good'
                      : 'weak'
              }
              body={
                freeholdPct != null
                  ? `${freeholdPct >= 80 ? 'Freehold — foreigners can own 100%.' : freeholdPct >= 30 ? 'Mixed ownership — check the parcel.' : 'Mostly leasehold — limited freehold.'} Properties from AED 750K qualify for an investor visa.`
                  : 'Land-registry coverage incomplete for this area.'
              }
              ctaLabel="Learn about visas"
              ctaHref="/learn"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface VerdictInput {
  yieldPct: number | null;
  appreciation5yPct: number | null;
  marketAvgYieldPct: number;
}
interface Verdict {
  label: string;
  emoji: string;
  reason: string;
  tone: 'best' | 'income' | 'growth' | 'emerging';
}
function computeVerdict({
  yieldPct,
  appreciation5yPct,
  marketAvgYieldPct,
}: VerdictInput): Verdict {
  const highYield = yieldPct != null && yieldPct >= marketAvgYieldPct + 1;
  const highGrowth = appreciation5yPct != null && appreciation5yPct >= 100;
  if (highYield && highGrowth) {
    return {
      label: 'Best of Both Worlds',
      emoji: '🏆',
      reason: 'Above-average yield and strong 5-year appreciation.',
      tone: 'best',
    };
  }
  if (highYield) {
    return {
      label: 'Strong Income Returns',
      emoji: '💰',
      reason: `Yield runs above the Dubai average of ${marketAvgYieldPct.toFixed(1)}%.`,
      tone: 'income',
    };
  }
  if (highGrowth) {
    return {
      label: 'Strong Capital Growth',
      emoji: '📈',
      reason: '5-year price growth above 100% — capital appreciation play.',
      tone: 'growth',
    };
  }
  return {
    label: 'Emerging Opportunity',
    emoji: '🔍',
    reason: 'Limited data or below-average signal — see history below.',
    tone: 'emerging',
  };
}

// ---------------------------------------------------------------------------

interface PlainTileProps {
  label: string;
  tooltip?: string;
  headline: string;
  caption: string;
  icon: React.ReactNode;
  tone?: 'default' | 'positive' | 'accent';
}
function PlainTile({
  label,
  tooltip,
  headline,
  caption,
  icon,
  tone = 'default',
}: PlainTileProps) {
  return (
    <div className="bg-bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {icon}
        <span>{label}</span>
        {tooltip && <MetricTooltip metric={tooltip} />}
      </div>
      <div
        className={cn(
          'mt-1.5 text-sm sm:text-[15px] font-semibold tabular leading-snug',
          tone === 'positive' && 'text-positive',
          tone === 'accent' && 'text-accent',
        )}
      >
        {headline}
      </div>
      <div className="mt-1 text-[10px] text-fg-subtle leading-relaxed">
        {caption}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Fit = 'strong' | 'good' | 'weak' | 'unknown';
interface InvestorCardProps {
  icon: React.ReactNode;
  title: string;
  fit: Fit;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}
function InvestorCard({
  icon,
  title,
  fit,
  body,
  ctaLabel,
  ctaHref,
}: InvestorCardProps) {
  const fitMeta = {
    strong: { label: 'Strong fit', tone: 'bg-positive/15 text-positive' },
    good: { label: 'Good fit', tone: 'bg-accent/15 text-accent' },
    weak: { label: 'Lower fit', tone: 'bg-fg-muted/15 text-fg-muted' },
    unknown: { label: 'Limited data', tone: 'bg-fg-muted/15 text-fg-subtle' },
  }[fit];
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3.5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
          {icon}
          {title}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium',
            fitMeta.tone,
          )}
        >
          {fitMeta.label}
        </span>
      </div>
      <p className="text-[11px] text-fg-muted leading-relaxed flex-1">{body}</p>
      <Link
        href={ctaHref}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
      >
        {ctaLabel}
        <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface BottomCTAsProps {
  areaName: string;
  areaSlugForRoi: string;
  areaSlugForBrokers: string;
  areaId: string;
}
export function AreaBottomCTAs({
  areaName,
  areaSlugForRoi,
  areaSlugForBrokers,
  areaId,
}: BottomCTAsProps) {
  return (
    <section className="mt-8 mb-4">
      <div className="rounded-lg border border-border bg-bg-card p-5 sm:p-6 text-center">
        <h2 className="text-base sm:text-lg font-semibold text-fg tracking-tight">
          Ready to invest in {areaName}?
        </h2>
        <p className="mt-1 text-xs text-fg-muted">
          Pick a next step — every tool here uses live DLD data, no fluff.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BottomCta
            href="/advisor"
            label="Ask AI Advisor"
            emoji="🤖"
          />
          <BottomCta
            href={`/brokers/directory?area=${encodeURIComponent(areaSlugForBrokers)}`}
            label="Find a Broker"
            emoji="👤"
          />
          <BottomCta
            href={`/roi-calculator?area=${encodeURIComponent(areaSlugForRoi)}`}
            label="Calculate ROI"
            emoji="🧮"
          />
          <BottomCta
            href={`/compare?ids=${areaId}`}
            label="Compare Areas"
            emoji="📊"
          />
        </div>
      </div>
    </section>
  );
}
function BottomCta({
  href,
  label,
  emoji,
}: {
  href: string;
  label: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-3 py-3 text-xs font-medium text-fg hover:border-accent/40 hover:bg-accent/5 transition-colors min-h-[68px]"
    >
      <span className="text-base" aria-hidden>
        {emoji}
      </span>
      <span>{label}</span>
    </Link>
  );
}

