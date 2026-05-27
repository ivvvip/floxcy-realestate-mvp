/**
 * Derive a clear investor-profile label from an area's metrics.
 * Conservative | Balanced | High growth | High risk
 */
export type InvestmentLabel =
  | 'Conservative'
  | 'Balanced'
  | 'High growth'
  | 'High risk';

interface Metrics {
  rental_yield?: number | null;
  appreciation_1y?: number | null;
  risk_score?: number | null;
  investment_score?: number | null;
}

export function classifyInvestment(m: Metrics): InvestmentLabel {
  const risk = m.risk_score ?? 5;
  const yieldPct = m.rental_yield ?? 0;
  const appr = m.appreciation_1y ?? 0;
  if (risk >= 7.5) return 'High risk';
  if (risk <= 3.5 && yieldPct >= 6 && appr >= 0) return 'Conservative';
  if (appr >= 8 || (appr >= 6 && yieldPct >= 6)) return 'High growth';
  return 'Balanced';
}

export const LABEL_DESCRIPTIONS: Record<InvestmentLabel, string> = {
  Conservative: 'Established, blue-chip district with stable cash flow',
  Balanced: 'Mainstream pick with healthy fundamentals',
  'High growth': 'Capital appreciation outpaces the cohort',
  'High risk': 'Elevated volatility — opportunistic capital only',
};

export const LABEL_TONES: Record<InvestmentLabel, 'positive' | 'neutral' | 'accent' | 'negative'> = {
  Conservative: 'positive',
  Balanced: 'neutral',
  'High growth': 'accent',
  'High risk': 'negative',
};
