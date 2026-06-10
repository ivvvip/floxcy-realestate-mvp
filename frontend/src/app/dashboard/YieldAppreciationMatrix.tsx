'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardPulseResponse } from '@/lib/types';
import { cn } from '@/lib/cn';
import { MetricTooltip } from '@/components/MetricTooltip';
import { toAreaSlug } from '@/lib/slugs';

const QUADRANT_TONE = {
  best_investment: 'positive',
  income_focus: 'accent',
  growth_focus: 'accent',
  avoid: 'muted',
} as const;

export function YieldVsAppreciationMatrix({
  pulse,
}: {
  pulse: DashboardPulseResponse;
}) {
  const router = useRouter();
  const points = pulse.matrix_points;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="text-sm font-semibold text-fg">
          Yield × 5-year appreciation
        </h3>
        <p className="mt-2 text-xs text-fg-subtle">
          No areas with full yield + appreciation history yet.
        </p>
      </section>
    );
  }

  const W = 320;
  const H = 280;
  const PAD = 32;
  const xs = points.map((p) => p.appreciation_5y_pct);
  const ys = points.map((p) => p.yield_pct);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 50);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 12);
  const sx = (x: number) =>
    PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const sy = (y: number) =>
    H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  const xMid = sortedX[Math.floor(sortedX.length / 2)];
  const yMid = sortedY[Math.floor(sortedY.length / 2)];

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const slugFor = (nameNorm: string) => toAreaSlug(nameNorm);

  return (
    <section className="card p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg inline-flex items-center">
            Yield × 5-year appreciation
            <MetricTooltip metric="Gross yield" />
            <MetricTooltip metric="5Y Appreciation" />
          </h3>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            {points.length.toLocaleString()} areas · click any dot to explore
          </p>
        </div>
      </div>
      <div className="mt-3 relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Yield vs 5y appreciation scatter"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Quadrant background tints */}
          <rect
            x={sx(xMid)}
            y={PAD}
            width={W - PAD - sx(xMid)}
            height={sy(yMid) - PAD}
            fill="rgb(34,197,94)"
            fillOpacity="0.08"
          />
          <rect
            x={PAD}
            y={PAD}
            width={sx(xMid) - PAD}
            height={sy(yMid) - PAD}
            fill="rgb(56,189,248)"
            fillOpacity="0.06"
          />
          <rect
            x={sx(xMid)}
            y={sy(yMid)}
            width={W - PAD - sx(xMid)}
            height={H - PAD - sy(yMid)}
            fill="rgb(56,189,248)"
            fillOpacity="0.06"
          />
          <rect
            x={PAD}
            y={sy(yMid)}
            width={sx(xMid) - PAD}
            height={H - PAD - sy(yMid)}
            fill="rgb(148,163,184)"
            fillOpacity="0.05"
          />
          {/* Midlines */}
          <line
            x1={sx(xMid)}
            y1={PAD}
            x2={sx(xMid)}
            y2={H - PAD}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeDasharray="2 2"
          />
          <line
            x1={PAD}
            y1={sy(yMid)}
            x2={W - PAD}
            y2={sy(yMid)}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeDasharray="2 2"
          />
          {/* Axes */}
          <line
            x1={PAD}
            y1={PAD}
            x2={PAD}
            y2={H - PAD}
            stroke="currentColor"
            strokeOpacity="0.35"
          />
          <line
            x1={PAD}
            y1={H - PAD}
            x2={W - PAD}
            y2={H - PAD}
            stroke="currentColor"
            strokeOpacity="0.35"
          />
          {/* Quadrant labels — neutral wording, investors decide */}
          <text
            x={W - PAD - 6}
            y={PAD + 14}
            textAnchor="end"
            fontSize="10"
            fill="rgb(34,197,94)"
            fontWeight="600"
          >
            🏆 Best Investment
          </text>
          <text
            x={PAD + 6}
            y={PAD + 14}
            textAnchor="start"
            fontSize="10"
            fill="rgb(56,189,248)"
            fontWeight="600"
          >
            💰 Income
          </text>
          <text
            x={W - PAD - 6}
            y={H - PAD - 6}
            textAnchor="end"
            fontSize="10"
            fill="rgb(56,189,248)"
            fontWeight="600"
          >
            📈 Growth
          </text>
          <text
            x={PAD + 6}
            y={H - PAD - 6}
            textAnchor="start"
            fontSize="10"
            fill="rgb(148,163,184)"
            fontWeight="600"
          >
            Lower Performance
          </text>
          {/* Axis labels */}
          <text
            x={W / 2}
            y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
            opacity="0.65"
          >
            5y appreciation %
          </text>
          <text
            x={10}
            y={H / 2}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
            opacity="0.65"
            transform={`rotate(-90 10 ${H / 2})`}
          >
            Yield %
          </text>
          {/* Dots — invisible hit area + visible circle, onClick navigates */}
          {points.map((p, i) => {
            const tone = QUADRANT_TONE[p.quadrant];
            const r = Math.max(
              2.5,
              Math.min(7, Math.log10(p.sample_score + 1) * 2),
            );
            const cx = sx(p.appreciation_5y_pct);
            const cy = sy(p.yield_pct);
            const active = hoverIdx === i;
            const href = `/areas/${slugFor(p.area_name_norm)}`;
            return (
              <g
                key={p.area_name_norm}
                onMouseEnter={() => setHoverIdx(i)}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`${p.area_name_display}: yield ${p.yield_pct.toFixed(1)}%, 5y appreciation ${p.appreciation_5y_pct.toFixed(0)}%`}
                style={{ cursor: 'pointer', outline: 'none' }}
              >
                {/* Larger invisible hit target so small dots are still easy to click */}
                <circle cx={cx} cy={cy} r={Math.max(r + 6, 11)} fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? r + 2 : r}
                  className={cn(
                    'transition-all pointer-events-none',
                    tone === 'positive' && 'fill-positive',
                    tone === 'accent' && 'fill-accent',
                    tone === 'muted' && 'fill-fg-muted',
                  )}
                  fillOpacity={active ? 1 : 0.75}
                  stroke={active ? 'currentColor' : 'none'}
                  strokeOpacity={active ? 0.7 : 0}
                  strokeWidth={1.25}
                />
              </g>
            );
          })}
        </svg>
        {/* HTML tooltip — positioned over the SVG using percentage coords */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-bg-card/95 px-3 py-2 shadow-lg text-[11px] leading-snug"
            style={{
              left: `${(sx(hover.appreciation_5y_pct) / W) * 100}%`,
              top: `${(sy(hover.yield_pct) / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 14px))',
              maxWidth: 220,
              minWidth: 160,
            }}
          >
            <div className="font-semibold text-fg truncate">
              {hover.area_name_display}
            </div>
            <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular text-fg-muted">
              <span>Yield</span>
              <span className="text-fg text-right">
                {hover.yield_pct.toFixed(1)}%
              </span>
              <span>5y appreciation</span>
              <span className="text-fg text-right">
                {hover.appreciation_5y_pct >= 0 ? '+' : ''}
                {hover.appreciation_5y_pct.toFixed(0)}%
              </span>
            </div>
            <div className="mt-1.5 text-accent font-medium">
              Click to explore →
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
