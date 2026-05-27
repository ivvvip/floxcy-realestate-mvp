import { Info, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import type { ConfidenceReport } from '@/lib/types';
import { cn } from '@/lib/cn';

interface Props {
  report: ConfidenceReport | null | undefined;
  className?: string;
  compact?: boolean;
}

function fmtDelay(min: number | null | undefined): string {
  if (min == null) return 'unknown';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / (24 * 60))} d ago`;
}

export function ConfidenceBadge({ report, className, compact = false }: Props) {
  if (!report) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[11px] text-fg-subtle',
          className
        )}
      >
        <ShieldOff className="h-3 w-3" strokeWidth={2} />
        Confidence unavailable
      </span>
    );
  }
  const Icon =
    report.level === 'high'
      ? ShieldCheck
      : report.level === 'medium'
        ? Info
        : ShieldAlert;
  const tone =
    report.level === 'high'
      ? 'border-positive/30 bg-positive/10 text-positive'
      : report.level === 'medium'
        ? 'border-border-strong bg-bg-elev/60 text-fg-muted'
        : 'border-negative/40 bg-negative/10 text-negative';

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular',
          tone,
          className
        )}
        title={`Confidence ${report.score}% (${report.level}). Updated ${fmtDelay(
          report.data_delay_minutes
        )}.`}
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} />
        {report.score}% {report.level}
      </span>
    );
  }

  return (
    <div className={cn('border border-border rounded-lg bg-bg-card', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular',
            tone
          )}
        >
          <Icon className="h-3 w-3" strokeWidth={2.5} />
          Confidence {report.score}% · {report.level}
        </span>
        <span className="text-[11px] text-fg-subtle tabular">
          Updated {fmtDelay(report.data_delay_minutes)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-[11px]">
        <div>
          <dt className="text-fg-subtle uppercase tracking-wide">Sample size</dt>
          <dd className="tabular text-fg">
            {report.sample_size.toLocaleString()} transactions
          </dd>
        </div>
        <div>
          <dt className="text-fg-subtle uppercase tracking-wide">Data delay</dt>
          <dd className="tabular text-fg">
            {fmtDelay(report.data_delay_minutes)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-fg-subtle uppercase tracking-wide">Sources</dt>
          <dd className="text-fg-muted">{report.sources.join(' · ')}</dd>
        </div>
      </dl>
      {report.level === 'low' && (
        <div className="border-t border-border bg-negative/5 px-3 py-1.5 text-[11px] text-negative">
          ⚠ Low confidence — treat figures as directional only.
        </div>
      )}
    </div>
  );
}

export function ConfidenceWarningBanner({
  report,
}: {
  report: ConfidenceReport | null;
}) {
  if (!report || report.level !== 'low') return null;
  return (
    <div className="border border-negative/30 bg-negative/10 rounded-md px-3 py-2 text-xs text-negative flex items-start gap-2">
      <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
      <div>
        <strong className="font-medium">Low data confidence ({report.score}%).</strong>{' '}
        {report.sample_size === 0
          ? 'No recent transactions in this segment — figures are not reliable.'
          : `Sample size is thin (${report.sample_size.toLocaleString()} transactions).`}{' '}
        Use directionally; verify before acting.
      </div>
    </div>
  );
}
