import { visaTier } from '@/lib/visa';

/**
 * Visa-eligibility badge from a property price. Renders nothing below the
 * investor-visa threshold unless `showBelow` is set.
 */
export function VisaBadge({
  price,
  showBelow = false,
  size = 'sm',
}: {
  price: number | null | undefined;
  showBelow?: boolean;
  size?: 'sm' | 'xs';
}) {
  const t = visaTier(price);
  if (t.tier === 'none' && !showBelow) return null;
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border tabular whitespace-nowrap ${pad} ${t.className}`}
      title="Indicative — verify current rules with DLD/ICP/GDRFA"
    >
      {t.emoji && <span>{t.emoji}</span>}
      {t.tier === 'none' ? 'Below visa threshold' : `${t.label} (${t.years})`}
    </span>
  );
}
