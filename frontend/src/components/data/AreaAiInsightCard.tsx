'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Target, ShieldAlert, TrendingUp, User } from 'lucide-react';
import { getAreaInsight } from '@/lib/api';
import type { AreaInsight } from '@/lib/types';
import { cn } from '@/lib/cn';

const PROFILE_TONE: Record<string, string> = {
  'Income-focused': 'border-positive/40 bg-positive/10 text-positive',
  'Growth-focused': 'border-accent/40 bg-accent/10 text-accent',
  Balanced: 'border-border-strong bg-bg-elev/40 text-fg-muted',
  Speculative: 'border-negative/40 bg-negative/10 text-negative',
};

export function AreaAiInsightCard({ areaId }: { areaId: string }) {
  const [insight, setInsight] = useState<AreaInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAreaInsight(areaId)
      .then((r) => {
        if (!cancelled) setInsight(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Insight unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [areaId]);

  if (loading) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-4 text-xs text-fg-muted inline-flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" strokeWidth={2} />
        Generating AI insight…
      </div>
    );
  }
  if (error || !insight) return null;

  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="chart-header">
        <span className="chart-header-label inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          AI insight
        </span>
        <span className="text-[11px] text-fg-subtle tabular flex items-center gap-1.5">
          {insight.cached && <span className="pill">cached</span>}
          {insight.fallback_used && (
            <span className="pill pill-negative">fallback</span>
          )}
          {insight.model && (
            <span className="pill">{insight.model.split('/').pop()}</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        <Section
          icon={Target}
          label="Opportunity"
          body={insight.opportunity_summary}
          tone="positive"
        />
        <Section
          icon={ShieldAlert}
          label="Risk"
          body={insight.risk_summary}
          tone="negative"
        />
        <Section
          icon={TrendingUp}
          label="Trend"
          body={insight.trend_interpretation}
          tone="neutral"
        />
        <div className="bg-bg-card p-4">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
            <span className="chart-header-label">Investor profile</span>
          </div>
          <div className="mt-2">
            <span
              className={cn(
                'pill text-sm',
                PROFILE_TONE[insight.investor_profile_recommendation] ?? ''
              )}
            >
              {insight.investor_profile_recommendation}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border px-4 py-2 text-[11px] text-fg-subtle italic">
        AI-generated. Grounded in the latest market snapshot for this area.
        Not investment advice.
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  body,
  tone,
}: {
  icon: typeof Target;
  label: string;
  body: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const dot =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-fg-muted';
  return (
    <div className="bg-bg-card p-4">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', dot)} strokeWidth={2} />
        <span className="chart-header-label">{label}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}
