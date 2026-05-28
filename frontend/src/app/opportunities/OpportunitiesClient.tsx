'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight, BellPlus, Info, Sparkles, Loader2, MapPin } from 'lucide-react';
import type {
  OpportunityExplanation,
  OpportunityResult,
  OpportunityTier,
} from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FilterChip } from '@/components/data/FilterChip';
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge';
import { DataBadge } from '@/components/data/DataBadge';
import { createAlert, explainOpportunity } from '@/lib/api';

const TIERS: { value: OpportunityTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strong', label: 'Strong Opportunity' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'neutral', label: 'Fair Value' },
  { value: 'overpriced', label: 'Overvalued' },
];

const TIER_DISPLAY: Record<OpportunityTier, string> = {
  strong: 'Strong Opportunity',
  moderate: 'Moderate',
  neutral: 'Fair Value',
  overpriced: 'Overvalued',
};

const INVESTOR_TONE: Record<string, string> = {
  'Income-focused': 'border-positive/40 bg-positive/10 text-positive',
  'Growth-focused': 'border-accent/40 bg-accent/10 text-accent',
  Balanced: 'border-border-strong bg-bg-elev/40 text-fg-muted',
  Speculative: 'border-negative/40 bg-negative/10 text-negative',
};

interface Props {
  opportunities: OpportunityResult[];
}

export function OpportunitiesClient({ opportunities }: Props) {
  const [tier, setTier] = useState<OpportunityTier | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(
    opportunities[0]?.area_id ?? null
  );

  const filtered = useMemo(
    () =>
      tier === 'all'
        ? opportunities
        : opportunities.filter((o) => o.tier === tier),
    [opportunities, tier]
  );

  const counts = useMemo(() => {
    const c: Record<OpportunityTier | 'all', number> = {
      all: opportunities.length,
      strong: 0,
      moderate: 0,
      neutral: 0,
      overpriced: 0,
    };
    for (const o of opportunities) c[o.tier]++;
    return c;
  }, [opportunities]);

  async function subscribeAlert() {
    try {
      await createAlert({
        type: 'opportunity_appears',
        params: { tier: 'strong' },
        delivery: 'in_app',
      });
      alert(
        'Alert created — you will be notified when a new strong opportunity appears.'
      );
    } catch {
      alert('Could not create alert. Try again.');
    }
  }

  if (!opportunities.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-10 text-center">
        <p className="text-sm text-fg-muted">
          No opportunities computed yet — the dataset may be empty. Seed via{' '}
          <Link href="/admin" className="text-accent hover:underline">
            admin
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {TIERS.map((t) => (
          <FilterChip
            key={t.value}
            label={t.label}
            count={counts[t.value]}
            active={tier === t.value}
            onClick={() => setTier(t.value)}
          />
        ))}
        <button
          type="button"
          onClick={subscribeAlert}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
        >
          <BellPlus className="h-3.5 w-3.5" strokeWidth={2} />
          Alert me on new strong opportunities
        </button>
      </div>

      <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                <th>Area</th>
                <th>Tier</th>
                <th className="text-right">Score</th>
                <th>Profile</th>
                <th className="text-right">Yield</th>
                <th className="text-right">AED/sqft</th>
                <th className="text-right">1Y</th>
                <th>Confidence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <OpportunityRow
                  key={o.area_id}
                  rank={i + 1}
                  opp={o}
                  expanded={expanded === o.area_id}
                  onToggle={() =>
                    setExpanded((cur) => (cur === o.area_id ? null : o.area_id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-fg-subtle flex items-start gap-2">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" strokeWidth={2} />
        <span>
          Scoring:{' '}
          <code className="text-fg-muted">
            0.30·yield_premium + 0.25·price_discount + 0.15·momentum +
            0.10·volume + 0.10·demand + 0.10·inv_risk
          </code>
          . Nearby comparison uses haversine distance from area centroid. See{' '}
          <Link href="/methodology" className="text-accent hover:underline">
            methodology
          </Link>{' '}
          for the full derivation. Not investment advice.
        </span>
      </div>
    </div>
  );
}

function OpportunityRow({
  rank,
  opp,
  expanded,
  onToggle,
}: {
  rank: number;
  opp: OpportunityResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tierClass = cn(
    'pill',
    opp.tier === 'strong' && 'pill-positive',
    opp.tier === 'overpriced' && 'pill-negative',
    opp.tier === 'moderate' && 'pill-accent'
  );
  const investorType = opp.suggested_investor_type ?? 'Balanced';

  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="num text-fg-subtle">{rank}</td>
        <td>
          <Link
            href={`/areas/${opp.area_id}`}
            className="font-medium text-fg hover:text-accent transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {opp.area_name}
          </Link>
        </td>
        <td>
          <span className={tierClass}>{TIER_DISPLAY[opp.tier] ?? opp.tier}</span>
        </td>
        <td className="num font-semibold text-fg">{opp.score}</td>
        <td>
          <span className={cn('pill', INVESTOR_TONE[investorType] ?? '')}>
            {investorType}
          </span>
        </td>
        <td className="num">{formatPercent(opp.snapshot.rental_yield, 2)}</td>
        <td className="num">{formatNumber(opp.snapshot.avg_price_per_sqft, 0)}</td>
        <td className="num">
          <DataBadge value={opp.snapshot.appreciation_1y} format="percent" />
        </td>
        <td>
          <ConfidenceBadge report={opp.confidence} compact />
        </td>
        <td className="num">
          <ArrowUpRight
            className={cn(
              'inline h-3 w-3 text-fg-subtle transition-transform',
              expanded && 'rotate-90'
            )}
            strokeWidth={2}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-bg-elev/30">
          <td colSpan={10}>
            <ExpandedDetail opp={opp} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ opp }: { opp: OpportunityResult }) {
  const [explanation, setExplanation] = useState<OpportunityExplanation | null>(null);
  const [loadingExp, setLoadingExp] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  async function loadExplanation() {
    if (explanation || loadingExp) return;
    setLoadingExp(true);
    setExpError(null);
    try {
      const r = await explainOpportunity(opp.area_id);
      setExplanation(r);
    } catch (e) {
      setExpError(e instanceof Error ? e.message : 'Failed to load explanation');
    } finally {
      setLoadingExp(false);
    }
  }

  return (
    <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            {opp.headline}
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Why this scores well
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
                {opp.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-positive" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Risks to watch
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
                {opp.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-negative" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {opp.best_for.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                Also suitable for
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {opp.best_for.map((p, i) => (
                  <span
                    key={i}
                    className="pill border-border-strong text-fg-muted"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI explanation panel */}
        <div className="border border-border rounded-lg bg-bg-card">
          <div className="chart-header">
            <span className="chart-header-label inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              AI explanation
            </span>
            {explanation && (
              <span className="text-[11px] text-fg-subtle tabular">
                {explanation.cached && <span className="pill mr-1">cached</span>}
                {explanation.model?.split('/').pop()}
                {explanation.tokens != null && (
                  <> · {explanation.tokens} tok</>
                )}
              </span>
            )}
          </div>
          <div className="p-4">
            {explanation ? (
              <article className="prose-floxcy">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    p: (p) => <p className="text-sm text-fg-muted leading-relaxed mb-2" {...p} />,
                    ul: (p) => <ul className="space-y-1 text-sm text-fg-muted list-disc pl-5 mb-2" {...p} />,
                    strong: (p) => <strong className="text-fg font-medium" {...p} />,
                    em: (p) => <em className="text-fg-subtle text-[11px] not-italic block mt-2 border-t border-border pt-2" {...p} />,
                  }}
                >
                  {explanation.markdown}
                </ReactMarkdown>
              </article>
            ) : loadingExp ? (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                Generating AI explanation…
              </div>
            ) : expError ? (
              <div className="text-xs text-negative">{expError}</div>
            ) : (
              <button
                type="button"
                onClick={loadExplanation}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                Generate AI explanation
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <ConfidenceBadge report={opp.confidence} />

        {/* Nearby comparison */}
        {opp.nearby_comparison && opp.nearby_comparison.length > 0 && (
          <div className="border border-border rounded-lg bg-bg-card">
            <div className="chart-header">
              <span className="chart-header-label inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                Nearby (3 closest)
              </span>
            </div>
            <table className="data-table">
              <tbody>
                {opp.nearby_comparison.map((n) => (
                  <tr key={n.area_id}>
                    <td>
                      <Link
                        href={`/areas/${n.area_id}`}
                        className="text-fg hover:text-accent text-xs"
                      >
                        {n.area_name}
                      </Link>
                      <div className="text-[10px] text-fg-subtle tabular">
                        {n.distance_km.toFixed(1)} km · {formatNumber(n.price_per_sqft, 0)} AED/sqft · {formatPercent(n.rental_yield, 1)}
                      </div>
                    </td>
                    <td className="num">
                      <span
                        className={cn(
                          'pill',
                          n.tier === 'strong' && 'pill-positive',
                          n.tier === 'overpriced' && 'pill-negative'
                        )}
                      >
                        {n.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Factor breakdown */}
        <div className="border border-border rounded-lg bg-bg-card">
          <div className="chart-header">
            <span className="chart-header-label">Factor breakdown</span>
          </div>
          <table className="data-table">
            <tbody>
              {opp.factors.map((f) => (
                <tr key={f.name}>
                  <td className="text-fg-muted text-[11px] capitalize">
                    {f.name.replace(/_/g, ' ')}
                  </td>
                  <td className="num text-[11px]">
                    {f.contribution.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link
          href={`/areas/${opp.area_id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
        >
          Open full area detail
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
