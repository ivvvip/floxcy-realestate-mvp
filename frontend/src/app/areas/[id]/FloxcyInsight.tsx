import Link from 'next/link';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Award, Database, Home,
  Sparkles, Target, TrendingUp, Users,
} from 'lucide-react';
import { getSimilarAreas, getMarketTiming } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { MarketTimingResponse, SimilarAreasResponse } from '@/lib/types';

interface Props {
  /** Display name of the area (e.g. "Business Bay") */
  areaName: string;
  /** The DLD-side name we can use to query /similar + /market-timing. May
   *  be the same as areaName, or e.g. "marsa dubai" for "Dubai Marina". */
  dldName?: string | null;
  metrics: {
    rental_yield: number | null;
    appreciation_1y: number | null;
    appreciation_3y: number | null;
    avg_price_per_sqft: number | null;
    investment_score: number | null;
    risk_score: number | null;
  };
}

/**
 * Floxcy Insight panel — Investment Grade + Best-For tags + Market Timing
 * + Similar Areas. Everything cited to DLD where possible; falls back to
 * "data not yet available" honestly when an upstream lookup misses.
 */
export async function FloxcyInsight({ areaName, dldName, metrics }: Props) {
  const lookupName = dldName || areaName;

  let similar: SimilarAreasResponse | null = null;
  let timing: MarketTimingResponse | null = null;
  try {
    [similar, timing] = await Promise.all([
      getSimilarAreas(lookupName, 3).catch(() => null),
      getMarketTiming(lookupName).catch(() => null),
    ]);
  } catch {
    // both already softened — render with what we have
  }

  const grade = computeInvestmentGrade(metrics, timing);
  const tags = computeBestForTags(metrics, timing);

  return (
    <section className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          Floxcy Insight
        </h2>
        <span className="pill pill-accent text-[10px] inline-flex items-center gap-1">
          <Database className="h-2.5 w-2.5" strokeWidth={2.5} />
          DLD-derived
        </span>
      </div>

      <div className="p-4 grid gap-4 md:grid-cols-12">
        {/* Investment Grade */}
        <div className="md:col-span-4 rounded-md border border-border bg-bg-elev/30 p-4 flex flex-col items-center justify-center text-center">
          <Award className="h-4 w-4 text-fg-subtle mb-1" strokeWidth={2} />
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Investment grade</div>
          <div className={cn(
            'mt-1 text-5xl font-bold tabular leading-none',
            grade.tone === 'top' ? 'text-positive' :
            grade.tone === 'good' ? 'text-accent' :
            grade.tone === 'mid' ? 'text-fg' :
            'text-warning'
          )}>
            {grade.letter}
          </div>
          <div className="mt-2 text-[10px] text-fg-muted">{grade.reason}</div>
        </div>

        {/* Best For tags + Market Timing */}
        <div className="md:col-span-8 space-y-3">
          <div>
            <h3 className="text-[10px] uppercase tracking-wide text-fg-subtle mb-1.5">Best for</h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <span className="text-[11px] text-fg-subtle italic">No standout investor profile from current data</span>
              ) : (
                tags.map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] text-accent"
                  >
                    {t.icon}
                    {t.label}
                  </span>
                ))
              )}
            </div>
          </div>

          {timing && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wide text-fg-subtle mb-1.5">Market timing</h3>
              <div className="border border-border rounded-md bg-bg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    'text-xs font-semibold',
                    timing.verdict === 'good_time' ? 'text-positive' :
                    timing.verdict === 'caution' ? 'text-warning' :
                    'text-fg'
                  )}>
                    {timing.headline}
                  </span>
                  <span className="text-[10px] text-fg-subtle">{timing.confidence} confidence</span>
                </div>
                {timing.signals.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-fg-muted">
                    {timing.signals.map((s) => (
                      <li key={s.label} className="flex items-baseline gap-2">
                        <span className={cn(
                          'w-2 text-center',
                          s.tone === 'positive' ? 'text-positive' :
                          s.tone === 'negative' ? 'text-warning' :
                          'text-fg-subtle'
                        )}>•</span>
                        <span className="text-fg-subtle w-24 shrink-0 capitalize">
                          {s.label.replace(/_/g, ' ')}
                        </span>
                        <span className="text-fg">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Similar Areas */}
      <div className="border-t border-border bg-bg-elev/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-[10px] uppercase tracking-wide text-fg-subtle inline-flex items-center gap-1">
            Areas like {areaName}
          </h3>
          {similar && similar.source_yield_pct != null && (
            <span className="text-[10px] text-fg-subtle tabular">
              vs {similar.source_yield_pct.toFixed(2)}% yield · {formatNumber(similar.source_price_per_sqft ?? 0, 0)} AED/sqft
            </span>
          )}
        </div>
        {similar && similar.items.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {similar.items.map((s) => (
              <Link
                key={s.area_name_norm}
                href={`/areas/${encodeURIComponent(s.area_id)}`}
                className="block rounded-md border border-border bg-bg-card p-2.5 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg truncate">{s.area_name}</span>
                  <span className="text-[10px] text-accent tabular">
                    {Math.round(s.similarity_score * 100)}% match
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-fg-muted tabular">
                  {s.rental_yield_pct != null ? `${s.rental_yield_pct.toFixed(2)}% yield` : '—'}
                  {s.median_price_per_sqft != null && (
                    <> · {formatNumber(s.median_price_per_sqft, 0)} AED/sqft</>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-fg-subtle leading-snug">{s.reason}</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-fg-subtle italic">
            No similar-areas data available — this area isn&apos;t in the canonical DLD
            metrics index yet.
          </p>
        )}
      </div>

      {/* Honest note on lifestyle scoring */}
      <div className="border-t border-border px-4 py-2 text-[10px] text-fg-subtle italic">
        Lifestyle proximity scoring (metro / retail / landmarks) isn&apos;t currently
        sourced — we&apos;ll add it once integrated with public POI data, rather
        than fabricate it from coordinates alone.
      </div>
    </section>
  );
}

// ===========================================================================
// Grade + tag derivation
// ===========================================================================

function computeInvestmentGrade(
  m: Props['metrics'],
  timing: MarketTimingResponse | null,
): { letter: string; tone: 'top' | 'good' | 'mid' | 'low'; reason: string } {
  // Score = blended signal of yield, appreciation, investment_score, and
  // an inverted risk penalty. We round into 5 buckets.
  const yieldNorm = clamp01((m.rental_yield ?? 0) / 10);  // 10% = full
  const apprNorm = clamp01((m.appreciation_3y ?? m.appreciation_1y ?? 0) / 40); // 40% = full
  const invNorm = clamp01((m.investment_score ?? 5) / 10);
  const riskPenalty = clamp01((m.risk_score ?? 5) / 10); // higher = worse
  const timingBoost =
    timing?.verdict === 'good_time' ? 0.08 :
    timing?.verdict === 'caution' ? -0.08 : 0;
  const raw = 0.35 * yieldNorm + 0.30 * apprNorm + 0.20 * invNorm - 0.15 * riskPenalty + timingBoost;
  const score = clamp01(raw + 0.15); // small lift to spread the distribution

  if (score >= 0.78) {
    return {
      letter: 'A+',
      tone: 'top',
      reason: `Top-quartile signals across yield + growth (raw ${Math.round(score * 100)}/100)`,
    };
  }
  if (score >= 0.62) {
    return {
      letter: 'A',
      tone: 'good',
      reason: `Strong yield + growth profile (${Math.round(score * 100)}/100)`,
    };
  }
  if (score >= 0.45) {
    return {
      letter: 'B+',
      tone: 'mid',
      reason: `Solid investor pick with one weaker signal (${Math.round(score * 100)}/100)`,
    };
  }
  if (score >= 0.30) {
    return {
      letter: 'B',
      tone: 'mid',
      reason: `Average market profile (${Math.round(score * 100)}/100)`,
    };
  }
  return {
    letter: 'C',
    tone: 'low',
    reason: `Below-average mix or limited data (${Math.round(score * 100)}/100)`,
  };
}

function computeBestForTags(
  m: Props['metrics'],
  timing: MarketTimingResponse | null,
): { label: string; icon: React.ReactNode }[] {
  const tags: { label: string; icon: React.ReactNode }[] = [];

  if ((m.rental_yield ?? 0) >= 7) {
    tags.push({
      label: 'Income investors',
      icon: <Target className="h-3 w-3" strokeWidth={2.5} />,
    });
  }
  if ((m.appreciation_3y ?? m.appreciation_1y ?? 0) >= 25) {
    tags.push({
      label: 'Capital growth',
      icon: <TrendingUp className="h-3 w-3" strokeWidth={2.5} />,
    });
  }
  // Price-bucket heuristic: villa areas tend to higher absolute price + lower
  // ppsf range, apartment areas the inverse. Without prop_sub_type data we
  // approximate from avg_price_per_sqft band.
  const ppsf = m.avg_price_per_sqft ?? 0;
  if (ppsf > 0 && ppsf < 1500) {
    tags.push({
      label: 'Families (villa-leaning area)',
      icon: <Home className="h-3 w-3" strokeWidth={2.5} />,
    });
  } else if (ppsf >= 1800) {
    tags.push({
      label: 'Young professionals',
      icon: <Users className="h-3 w-3" strokeWidth={2.5} />,
    });
  }
  if (timing?.verdict === 'good_time') {
    tags.push({
      label: 'Entry window now',
      icon: <ArrowRight className="h-3 w-3" strokeWidth={2.5} />,
    });
  }
  return tags;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Suppress unused warnings
void ArrowDownRight; void ArrowUpRight;
