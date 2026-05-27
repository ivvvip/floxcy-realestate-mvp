export type AreaType = 'residential' | 'commercial' | 'mixed';

export interface Area {
  id: string;
  name: string;
  name_arabic: string | null;
  city: string;
  emirate: string;
  description: string | null;
  area_type: AreaType | string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  latest_price_per_sqft?: number | null;
  latest_yield?: number | null;
  appreciation_1y?: number | null;
  investment_score?: number | null;
}

export interface ROICalculateRequest {
  property_price: number;
  annual_rent: number;
  service_charges?: number;
  maintenance_cost?: number;
  other_costs?: number;
}

export interface ROICalculateResponse {
  property_price: number;
  annual_rent: number;
  total_costs: number;
  annual_net_income: number;
  gross_yield: number;
  net_yield: number;
  payback_years: number | null;
  interpretation: string;
}

export interface AreaStats {
  total_count: number;
  count_by_type: Record<string, number>;
  area_names: string[];
}

export interface AreaSnapshotPoint {
  snapshot_date: string;
  avg_price_per_sqft: number;
  avg_sale_price: number;
  rental_yield: number;
}

export interface AreaLatestSnapshot {
  snapshot_date: string;
  avg_sale_price: number;
  avg_price_per_sqft: number;
  avg_annual_rent: number;
  rental_yield: number;
  occupancy_rate: number | null;
  appreciation_1y: number | null;
  appreciation_3y: number | null;
  transaction_volume: number | null;
  demand_score: number | null;
  risk_score: number | null;
  investment_score: number | null;
}

export interface AreaDetail extends Area {
  latest: AreaLatestSnapshot | null;
  history: AreaSnapshotPoint[];
}

export interface TopAreaItem {
  id: string;
  name: string;
  name_arabic: string | null;
  area_type: string;
  avg_price_per_sqft: number;
  rental_yield: number;
  appreciation_1y: number | null;
  investment_score: number | null;
}

export interface TrendPoint {
  month: string;
  avg_price_per_sqft: number;
  avg_yield: number;
}

export interface DashboardSummary {
  total_areas: number;
  avg_yield: number;
  avg_price_per_sqft: number;
  top_performer: TopAreaItem | null;
  total_transaction_volume: number;
  top_areas: TopAreaItem[];
  price_trend: TrendPoint[];
}

export interface CompareSnapshotPoint {
  snapshot_date: string;
  avg_price_per_sqft: number;
  rental_yield: number;
  avg_sale_price: number;
}

export interface CompareAreaData {
  id: string;
  name: string;
  name_arabic: string | null;
  area_type: string;
  latest_price_per_sqft: number;
  latest_yield: number;
  latest_sale_price: number;
  appreciation_1y: number | null;
  appreciation_3y: number | null;
  occupancy_rate: number | null;
  demand_score: number | null;
  risk_score: number | null;
  investment_score: number | null;
  history: CompareSnapshotPoint[];
}

export interface CompareResponse {
  areas: CompareAreaData[];
}

export type AdvisorGoal = 'yield' | 'appreciation' | 'balanced';
export type AdvisorRisk = 'low' | 'med' | 'high';

export interface AdvisorQueryRequest {
  budget_aed: number;
  goal: AdvisorGoal;
  risk: AdvisorRisk;
}

export interface AdvisorRecommendation {
  rank: number;
  area_id: string;
  area_name: string;
  area_name_arabic: string | null;
  score: number;
  avg_price_per_sqft: number;
  rental_yield: number;
  appreciation_1y: number | null;
  risk_score: number | null;
  investment_score: number | null;
  estimated_affordable_sqft: number;
  reasoning: string[];
}

export interface AdvisorQueryResponse {
  goal: string;
  risk: string;
  budget_aed: number;
  recommendations: AdvisorRecommendation[];
}

// ---------- Confidence ----------

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceFactor {
  name: string;
  weight: number;
  score: number;
  note: string;
}

export interface ConfidenceReport {
  score: number;
  level: ConfidenceLevel;
  sources: string[];
  last_updated: string | null;
  sample_size: number;
  data_delay_minutes: number | null;
  methodology: string;
  factors: ConfidenceFactor[];
}

// ---------- Opportunities (undervaluation) ----------

export type OpportunityTier = 'strong' | 'moderate' | 'neutral' | 'overpriced';

export interface UndervaluationFactor {
  name: string;
  weight: number;
  raw: number;
  contribution: number;
  note: string;
}

export interface OpportunityResult {
  area_id: string;
  area_name: string;
  score: number;
  tier: OpportunityTier;
  headline: string;
  reasons: string[];
  risks: string[];
  best_for: string[];
  factors: UndervaluationFactor[];
  confidence: ConfidenceReport;
  snapshot: {
    snapshot_date: string;
    avg_price_per_sqft: number;
    rental_yield: number;
    appreciation_1y: number | null;
    transaction_volume: number | null;
    investment_score: number | null;
  };
}

// ---------- Rankings ----------

export interface RankingResult {
  area_id: string;
  area_name: string;
  area_type: string;
  metric: string;
  value: number;
  metric_display: {
    yield: number;
    appreciation_1y: number | null;
    transaction_volume: number | null;
    investment_score: number | null;
    risk_score: number | null;
    price_per_sqft: number;
  };
  confidence: ConfidenceReport;
}

// ---------- Alerts ----------

export type AlertType =
  | 'yield_above'
  | 'yield_below'
  | 'price_above'
  | 'price_below'
  | 'volume_spike'
  | 'undervalued_appears'
  | 'opportunity_appears';

export interface AlertCreateRequest {
  type: AlertType;
  area_id?: string;
  params: Record<string, unknown>;
  delivery?: 'in_app' | 'email' | 'whatsapp' | 'telegram';
}

export interface AlertOut {
  id: string;
  type: AlertType;
  type_label: string;
  area_id: string | null;
  area_name: string | null;
  params: Record<string, unknown>;
  is_active: boolean;
  last_fired_at: string | null;
  last_value: string | null;
  delivery: string;
  created_at: string;
}

export interface AlertTypesResponse {
  types: Record<string, string>;
}

// ---------- Methodology ----------

export interface Methodology {
  version: string;
  last_updated: string;
  disclaimer: string;
  data_sources: Record<
    string,
    { name: string; type: string; frequency: string; url?: string }
  >;
  metrics: Record<string, { formula: string; unit?: string; notes?: string }>;
  scoring: Record<
    string,
    {
      formula: string;
      notes?: string;
      tiers?: Record<string, string>;
      levels?: Record<string, string>;
    }
  >;
  update_cadence: Record<string, string>;
  limitations: string[];
}

// ---------- Auth ----------

export type Role = 'viewer' | 'analyst' | 'admin';

export interface MeResponse {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

// ---------- Admin ----------

export interface AuditLogEntry {
  id: string;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  status: string;
  created_at: string;
}

export interface ApiKeyPublic {
  id: string;
  prefix: string;
  name: string;
  tier: string;
  rate_limit_per_min: number | null;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyCreateRequest {
  name: string;
  tier?: 'free' | 'pro' | 'api' | 'enterprise';
  rate_limit_per_min?: number;
  expires_at?: string;
}

export interface ApiKeyCreateResponse extends ApiKeyPublic {
  full_key: string;
}
