/**
 * Subscription tier definitions.
 *
 * Payments are NOT integrated yet — this file is the source of truth for
 * pricing display and (future) feature-flag gating. Add Stripe/Tap when
 * monetization goes live.
 */

export type PlanTier = 'free' | 'pro' | 'api' | 'enterprise';

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface Plan {
  tier: PlanTier;
  name: string;
  tagline: string;
  price_aed: number | 'custom';
  cadence: 'monthly' | 'annual' | 'custom';
  cta_label: string;
  cta_href: string;
  rate_limit_per_min: number;
  features: PlanFeature[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    tagline: 'Explore the platform',
    price_aed: 0,
    cadence: 'monthly',
    cta_label: 'Start free',
    cta_href: '/dashboard',
    rate_limit_per_min: 60,
    features: [
      { label: 'Dashboard with 10 UAE areas', included: true },
      { label: 'Basic rankings', included: true },
      { label: 'Confidence layer on every metric', included: true },
      { label: 'Read-only API (60 req/min)', included: true },
      { label: 'Undervalued Area Detector', included: false },
      { label: 'Area comparison (4-way)', included: false },
      { label: 'Investor alerts', included: false },
      { label: 'Email/WhatsApp/Telegram delivery', included: false },
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    tagline: 'For active investors',
    price_aed: 199,
    cadence: 'monthly',
    cta_label: 'Go Pro',
    cta_href: '/advisor',
    rate_limit_per_min: 600,
    highlight: true,
    features: [
      { label: 'Full dashboard, all UAE areas', included: true },
      { label: 'Undervalued Area Detector', included: true },
      { label: 'Area comparison (4-way)', included: true },
      { label: 'Investor alerts (in-app + email)', included: true },
      { label: 'AI Investment Analyst (unlimited queries)', included: true },
      { label: 'CSV export', included: true },
      { label: 'Read-only API (600 req/min)', included: true },
      { label: 'Commercial usage', included: false },
    ],
  },
  {
    tier: 'api',
    name: 'API',
    tagline: 'For developers & integrators',
    price_aed: 799,
    cadence: 'monthly',
    cta_label: 'Get API key',
    cta_href: '/api',
    rate_limit_per_min: 2000,
    features: [
      { label: 'All Pro features', included: true },
      { label: 'Higher rate limits (2,000 req/min)', included: true },
      { label: 'Commercial usage rights', included: true },
      { label: 'Webhook delivery for alerts', included: true },
      { label: 'Historical data access (3y)', included: true },
      { label: 'White-label branding', included: false },
      { label: 'Dedicated support', included: false },
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    tagline: 'For brokerages & funds',
    price_aed: 'custom',
    cadence: 'custom',
    cta_label: 'Contact sales',
    cta_href: '/about',
    rate_limit_per_min: 10_000,
    features: [
      { label: 'All API tier features', included: true },
      { label: 'White-label dashboard', included: true },
      { label: 'Custom data feeds & joins', included: true },
      { label: 'SLA-backed uptime', included: true },
      { label: 'Dedicated account manager', included: true },
      { label: 'On-premise deployment option', included: true },
      { label: 'Custom rate limits', included: true },
    ],
  },
];

/**
 * Feature-flag check. Returns true if the given plan tier has access to the
 * given feature. Used as a (currently unenforced) scaffold for future gating.
 */
export type Feature =
  | 'opportunities'
  | 'compare'
  | 'alerts'
  | 'advisor'
  | 'csv_export'
  | 'commercial_use';

const FEATURE_MATRIX: Record<Feature, PlanTier[]> = {
  opportunities: ['pro', 'api', 'enterprise'],
  compare: ['pro', 'api', 'enterprise'],
  alerts: ['pro', 'api', 'enterprise'],
  advisor: ['free', 'pro', 'api', 'enterprise'],
  csv_export: ['pro', 'api', 'enterprise'],
  commercial_use: ['api', 'enterprise'],
};

export function hasFeature(tier: PlanTier, feature: Feature): boolean {
  return FEATURE_MATRIX[feature].includes(tier);
}
