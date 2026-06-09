// UAE residence-visa eligibility by property value (2026 thresholds).
// Pure rule: price ≥ threshold → tier. Rules can change — every surface that
// uses this must show a "verify with DLD/ICP" caveat.

export const INVESTOR_VISA_AED = 750_000;
export const GOLDEN_VISA_AED = 2_000_000;

export type VisaTier = 'golden' | 'investor' | 'none';

export interface VisaTierInfo {
  tier: VisaTier;
  label: string;
  years: string;
  emoji: string;
  className: string;
}

export function visaTier(price: number | null | undefined): VisaTierInfo {
  if (price != null && price >= GOLDEN_VISA_AED) {
    return {
      tier: 'golden',
      label: 'Golden Visa Eligible',
      years: '10-yr',
      emoji: '🟢',
      className: 'border-positive/40 text-positive bg-positive/5',
    };
  }
  if (price != null && price >= INVESTOR_VISA_AED) {
    return {
      tier: 'investor',
      label: 'Investor Visa Eligible',
      years: '2-yr',
      emoji: '🔵',
      className: 'border-accent/40 text-accent bg-accent/5',
    };
  }
  return {
    tier: 'none',
    label: 'Below visa threshold',
    years: '',
    emoji: '',
    className: 'border-border text-fg-subtle',
  };
}
