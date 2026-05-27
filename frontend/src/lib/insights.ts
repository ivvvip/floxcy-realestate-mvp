import type {
  AreaDetail,
  AreaLatestSnapshot,
  TopAreaItem,
} from './types';

export type RiskTier = 'low' | 'moderate' | 'elevated' | 'high';
export type OpportunityTier = 'standout' | 'strong' | 'fair' | 'soft';

export interface RiskInterpretation {
  tier: RiskTier;
  label: string;
  score: number | null;
  rationale: string;
}

export interface OpportunityInterpretation {
  tier: OpportunityTier;
  label: string;
  rationale: string;
}

export interface InvestmentSummary {
  headline: string;
  body: string;
  bullets: string[];
}

interface MetricsLike {
  rental_yield: number;
  appreciation_1y: number | null;
  appreciation_3y: number | null;
  risk_score: number | null;
  demand_score: number | null;
  investment_score: number | null;
  occupancy_rate: number | null;
  avg_price_per_sqft: number;
}

const MARKET_YIELD = 6.5;
const MARKET_APP_1Y = 6.0;

export function interpretRisk(score: number | null): RiskInterpretation {
  if (score == null || !Number.isFinite(score)) {
    return {
      tier: 'moderate',
      label: 'Moderate',
      score: null,
      rationale: 'Risk score unavailable — treat as moderate until data refreshes.',
    };
  }
  if (score <= 3) {
    return {
      tier: 'low',
      label: 'Low risk',
      score,
      rationale:
        'Established, blue-chip district. Liquidity is strong and price volatility historically muted.',
    };
  }
  if (score <= 5) {
    return {
      tier: 'moderate',
      label: 'Moderate risk',
      score,
      rationale:
        'Mainstream investor demand with stable fundamentals. Suitable for core allocations.',
    };
  }
  if (score <= 7.5) {
    return {
      tier: 'elevated',
      label: 'Elevated risk',
      score,
      rationale:
        'Higher beta to market cycles. Position sizing matters; suitable as satellite allocation.',
    };
  }
  return {
    tier: 'high',
    label: 'High risk',
    score,
    rationale:
      'Emerging or thinly traded segment. Higher reward potential offset by liquidity and pricing risk.',
  };
}

export function describeOpportunity(m: MetricsLike): OpportunityInterpretation {
  const score = m.investment_score ?? 0;
  const yieldEdge = m.rental_yield - MARKET_YIELD;
  const apprEdge = (m.appreciation_1y ?? 0) - MARKET_APP_1Y;

  let tier: OpportunityTier;
  let label: string;

  if (score >= 8 || (yieldEdge > 1.5 && apprEdge > 2)) {
    tier = 'standout';
    label = 'Standout opportunity';
  } else if (score >= 6.5 || yieldEdge > 0.5 || apprEdge > 1) {
    tier = 'strong';
    label = 'Strong opportunity';
  } else if (score >= 5) {
    tier = 'fair';
    label = 'Fair value';
  } else {
    tier = 'soft';
    label = 'Below market';
  }

  const parts: string[] = [];
  if (yieldEdge > 0.5) {
    parts.push(
      `yield premium of ${yieldEdge.toFixed(1)}pp above the UAE benchmark`
    );
  } else if (yieldEdge < -0.5) {
    parts.push(
      `yield trails the benchmark by ${Math.abs(yieldEdge).toFixed(1)}pp`
    );
  }
  if (apprEdge > 1) {
    parts.push(
      `capital appreciation outpaces the market by ${apprEdge.toFixed(1)}pp YoY`
    );
  } else if (apprEdge < -1) {
    parts.push(
      `1Y appreciation lags the market by ${Math.abs(apprEdge).toFixed(1)}pp`
    );
  }
  if ((m.demand_score ?? 0) >= 7.5) parts.push('demand fundamentals are strong');
  if ((m.occupancy_rate ?? 0) >= 92) parts.push('occupancy sits in the top quartile');

  const rationale = parts.length
    ? `Drivers: ${parts.join('; ')}.`
    : 'Metrics broadly track the UAE benchmark — no standout edge or drag.';

  return { tier, label, rationale };
}

export function buildInvestmentSummary(
  name: string,
  m: MetricsLike
): InvestmentSummary {
  const opp = describeOpportunity(m);
  const risk = interpretRisk(m.risk_score);
  const yieldEdge = m.rental_yield - MARKET_YIELD;

  const profile =
    yieldEdge > 1
      ? 'income-led'
      : (m.appreciation_1y ?? 0) > MARKET_APP_1Y + 1
        ? 'growth-led'
        : 'balanced';

  const headline =
    opp.tier === 'standout'
      ? `${name} is a standout ${profile} position`
      : opp.tier === 'strong'
        ? `${name} offers a strong ${profile} setup`
        : opp.tier === 'fair'
          ? `${name} prices near fair value`
          : `${name} screens below the market`;

  const body =
    opp.tier === 'standout'
      ? `Both cash flow and capital growth screen above peers, with ${risk.label.toLowerCase()} fundamentals. The investment score of ${m.investment_score?.toFixed(1) ?? '—'}/10 reflects multi-factor strength.`
      : opp.tier === 'strong'
        ? `The combination of ${m.rental_yield.toFixed(2)}% yield and ${(m.appreciation_1y ?? 0).toFixed(2)}% 1Y appreciation lands above the UAE benchmark on at least one axis. Position sizing reflects ${risk.label.toLowerCase()}.`
        : opp.tier === 'fair'
          ? `Yield (${m.rental_yield.toFixed(2)}%) and growth (${(m.appreciation_1y ?? 0).toFixed(2)}% 1Y) cluster around UAE averages. Suitable for diversification, not concentration.`
          : `Underperformance versus the market on both yield and growth. Consider only with a specific thesis — e.g. infrastructure catalyst or distressed pricing.`;

  const bullets: string[] = [];
  bullets.push(
    `Yield ${m.rental_yield.toFixed(2)}% ${yieldEdge >= 0 ? '+' : ''}${yieldEdge.toFixed(1)}pp vs UAE benchmark (${MARKET_YIELD}%)`
  );
  if (m.appreciation_1y != null) {
    const edge = m.appreciation_1y - MARKET_APP_1Y;
    bullets.push(
      `1Y appreciation ${m.appreciation_1y.toFixed(2)}% ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}pp vs benchmark`
    );
  }
  if (m.appreciation_3y != null) {
    bullets.push(`3Y appreciation ${m.appreciation_3y.toFixed(2)}% — multi-year price trend`);
  }
  if (m.occupancy_rate != null) {
    bullets.push(
      `Occupancy ${m.occupancy_rate.toFixed(1)}% — ${
        m.occupancy_rate >= 92
          ? 'top-quartile tenant demand'
          : m.occupancy_rate >= 85
            ? 'healthy lease-up'
            : 'softer absorption'
      }`
    );
  }
  bullets.push(`${risk.label} · risk score ${risk.score?.toFixed(1) ?? '—'}/10`);

  return { headline, body, bullets };
}

export function summaryForLatest(
  area: AreaDetail | (TopAreaItem & { latest_price_per_sqft?: number })
): InvestmentSummary | null {
  if ('latest' in area && area.latest) {
    return buildSummaryFromSnapshot(area.name, area.latest);
  }
  if ('avg_price_per_sqft' in area) {
    const item = area as TopAreaItem;
    return buildInvestmentSummary(item.name, {
      rental_yield: item.rental_yield,
      appreciation_1y: item.appreciation_1y,
      appreciation_3y: null,
      risk_score: null,
      demand_score: null,
      investment_score: item.investment_score,
      occupancy_rate: null,
      avg_price_per_sqft: item.avg_price_per_sqft,
    });
  }
  return null;
}

function buildSummaryFromSnapshot(
  name: string,
  s: AreaLatestSnapshot
): InvestmentSummary {
  return buildInvestmentSummary(name, {
    rental_yield: s.rental_yield,
    appreciation_1y: s.appreciation_1y,
    appreciation_3y: s.appreciation_3y,
    risk_score: s.risk_score,
    demand_score: s.demand_score,
    investment_score: s.investment_score,
    occupancy_rate: s.occupancy_rate,
    avg_price_per_sqft: s.avg_price_per_sqft,
  });
}
