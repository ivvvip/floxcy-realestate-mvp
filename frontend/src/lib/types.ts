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
  preferred_city?: string;
  user_question?: string;
  fresh?: boolean;
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
  // LLM-augmented fields (optional)
  analysis?: string | null;
  confidence_score?: number | null;
  model_used?: string | null;
  tokens_used?: number | null;
  cost_usd?: number | null;
  latency_ms?: number | null;
  cached?: boolean;
  fallback_used?: boolean;
  ai_error?: string | null;
}

export interface AIAnalyticsBucket {
  queries: number;
  successful: number;
  errors: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  fallback_count: number;
  cached_count: number;
}

export interface AIAnalyticsResponse {
  as_of: string;
  today: AIAnalyticsBucket;
  week: AIAnalyticsBucket;
  month: AIAnalyticsBucket;
  by_model: Record<string, number>;
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

export interface NearbyArea {
  area_id: string;
  area_name: string;
  distance_km: number;
  score: number;
  tier: OpportunityTier;
  price_per_sqft: number;
  rental_yield: number;
}

export type InvestorType =
  | 'Income-focused'
  | 'Growth-focused'
  | 'Balanced'
  | 'Speculative';

export type OpportunityType =
  | 'Premium Hold'
  | 'Growth Opportunity'
  | 'Speculative'
  | 'Income Opportunity'
  | 'Value Opportunity'
  | 'Balanced';

export interface OpportunityComponents {
  yield: number;
  appreciation: number;
  value: number;
  demand: number;
  risk: number;
}

export interface OpportunityKeyMetrics {
  rental_yield: number;
  price_per_sqft: number;
  appreciation_1y: number | null;
  appreciation_3y: number | null;
  investment_score: number | null;
  risk_score: number | null;
  demand_score: number | null;
  transaction_volume: number | null;
  occupancy_rate: number | null;
}

export interface NearbyOpportunity {
  area_id: string;
  area_name: string;
  distance_km: number;
  opportunity_score: number;
  opportunity_type: OpportunityType;
  price_per_sqft: number;
  rental_yield: number;
}

export interface OpportunityResult {
  area_id: string;
  area_name: string;
  area_name_arabic: string | null;
  area_type: string;
  opportunity_score: number;
  opportunity_type: OpportunityType;
  confidence_level: number;
  components: OpportunityComponents;
  key_metrics: OpportunityKeyMetrics;
  why: string[];
  risks: string[];
  best_for: string;
  strategy: string;
  nearby_comparison: NearbyOpportunity[];
  snapshot_date: string;
  last_updated: string;
  data_confidence?: ConfidenceReport;
}

export interface OpportunitiesResponse {
  opportunities: OpportunityResult[];
  total: number;
  generated_at: string;
  methodology_link: string;
}

export interface OpportunityExplanation {
  area_id: string;
  area_name: string;
  why: string[];
  risks: string[];
  best_for: string;
  strategy: string;
  model: string | null;
  tokens: number;
  cost_usd?: number;
  latency_ms?: number;
  fallback_used?: boolean;
  cached: boolean;
}

// ---------- Market insights (P2) ----------

export interface MarketBriefBullet {
  headline: string;
  body: string;
  area_name: string | null;
}

export interface MarketBrief {
  as_of: string;
  brief: MarketBriefBullet[];
  model: string | null;
  tokens: number;
  cached: boolean;
  fallback_used?: boolean;
}

export interface AreaInsight {
  area_id: string;
  area_name: string;
  undervaluation_score: number;
  tier: OpportunityTier;
  opportunity_summary: string;
  risk_summary: string;
  investor_profile_recommendation: InvestorType | string;
  trend_interpretation: string;
  model: string;
  tokens: number;
  latency_ms?: number;
  cached: boolean;
  fallback_used?: boolean;
}

export interface MoverRow {
  area_id: string;
  name: string;
  price_pct_3mo: number;
  yield_pp_3mo: number;
  volume_pct_3mo: number;
  price_slope_pm: number;
  latest_price: number;
  latest_yield: number;
}

export interface TrendsResponse {
  as_of: string;
  price_up: MoverRow[];
  price_down: MoverRow[];
  yield_up: MoverRow[];
  volume_up: MoverRow[];
  narrative: string | null;
  model: string | null;
  tokens: number | null;
  cached: boolean;
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

// ---------- Supply layer: brokers, deals, leads, consultations ----------

export type BrokerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Broker {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  rera_license: string | null;
  languages: string[] | null;
  specialist_areas: string[] | null;
  property_types: string[] | null;
  experience_years: number | null;
  bio: string | null;
  status: BrokerStatus;
  performance_score: number;
  response_score: number;
  created_at: string;
}

export type BrokerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface BrokerApplication {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  rera_license: string | null;
  specialist_areas: string[] | null;
  experience_years: number | null;
  message: string | null;
  status: BrokerApplicationStatus;
  created_at: string;
}

export interface BrokerApplicationCreate {
  full_name: string;
  company_name?: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  rera_license?: string;
  specialist_areas?: string[];
  experience_years?: number;
  message?: string;
}

export interface BrokerApproveResponse {
  broker: Broker;
  temp_password: string | null;
}

export interface BrokerLoginResponse {
  token: string;
  broker: Broker;
}

export type DealStatus =
  | 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';

export type DealStrategy =
  | 'income' | 'growth' | 'balanced' | 'luxury' | 'high-risk';

export type DealRisk = 'low' | 'medium' | 'high';

export interface BrokerStub {
  id: string;
  full_name: string;
  company_name: string | null;
  whatsapp?: string | null;
  phone?: string | null;
}

export interface Deal {
  id: string;
  broker_id: string | null;
  title: string;
  emirate: string;
  area: string;
  property_type: string;
  unit_type: string | null;
  price: number;
  price_per_sqft: number | null;
  expected_annual_rent: number | null;
  expected_gross_yield: number | null;
  expected_net_yield: number | null;
  service_charges: number | null;
  strategy_type: DealStrategy;
  opportunity_score: number | null;
  risk_level: DealRisk;
  confidence_score: number | null;
  why_opportunity: string | null;
  risk_summary: string | null;
  best_for: string | null;
  status: DealStatus;
  source_type: 'broker' | 'developer' | 'manual';
  created_at: string;
  updated_at: string;
  broker?: BrokerStub | null;
}

export interface DealCreate {
  title: string;
  emirate?: string;
  area: string;
  property_type: string;
  unit_type?: string;
  price: number;
  price_per_sqft?: number;
  expected_annual_rent?: number;
  expected_gross_yield?: number;
  expected_net_yield?: number;
  service_charges?: number;
  strategy_type?: DealStrategy;
  risk_level?: DealRisk;
  confidence_score?: number;
  why_opportunity: string;
  risk_summary: string;
  best_for?: string;
}

export interface DealUpdate extends Partial<DealCreate> {
  status?: 'draft' | 'pending_review' | 'archived';
}

export type LeadStatus =
  | 'new' | 'contacted' | 'qualified' | 'viewing'
  | 'negotiating' | 'closed' | 'lost';

export interface InvestorLead {
  id: string;
  opportunity_id: string | null;
  matched_broker_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  budget: number | null;
  investment_goal: string | null;
  risk_level: string | null;
  preferred_area: string | null;
  timeline: string | null;
  message: string | null;
  lead_score: number | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

export interface LeadCreate {
  opportunity_id?: string;
  full_name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  budget?: number;
  investment_goal?: string;
  risk_level?: 'low' | 'medium' | 'high';
  preferred_area?: string;
  timeline?: string;
  message?: string;
}

export interface LeadUpdate {
  status?: LeadStatus;
  matched_broker_id?: string;
  lead_score?: number;
  message?: string;
}

export type ConsultationStatus =
  | 'requested' | 'assigned' | 'contacted' | 'completed' | 'cancelled';

export interface Consultation {
  id: string;
  investor_lead_id: string;
  broker_id: string | null;
  opportunity_id: string | null;
  status: ConsultationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultationRequestResponse {
  message: string;
  lead: InvestorLead;
  consultation: Consultation;
}

// ---------- Unified opportunity feed ----------

export interface AreaSignalFeedItem extends OpportunityResult {
  kind: 'area_signal';
}

export interface BrokerDealFeedItem {
  kind: 'broker_deal';
  id: string;
  title: string;
  area_name: string;
  emirate: string;
  price: number;
  property_type: string;
  unit_type: string | null;
  rental_yield: number | null;
  expected_net_yield: number | null;
  opportunity_score: number;
  strategy: DealStrategy;
  risk_level: DealRisk;
  confidence_score: number | null;
  why_short: string;
  source_type: 'broker' | 'developer' | 'manual';
  broker: { id: string; full_name: string; company_name: string | null } | null;
}

export type OpportunityFeedItem = AreaSignalFeedItem | BrokerDealFeedItem;

export interface OpportunityFeedResponse {
  opportunities: OpportunityFeedItem[];
  total: number;
  generated_at: string;
  methodology_link: string;
}
