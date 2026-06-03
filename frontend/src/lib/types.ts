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

export type CoverageTier = 'full' | 'partial' | 'limited' | 'none';

export interface AreaCoverageItem {
  id: string;
  slug: string;
  name: string;
  name_arabic: string | null;
  area_type: string;
  city: string;
  emirate: string;
  coverage_tier: CoverageTier;
  is_curated: boolean;
  median_price_per_sqft: number | null;
  rental_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  sales_count: number;
  rent_count_2026: number;
  investment_score: number | null;
  appreciation_1y: number | null;
}

export interface AreaCoverageResponse {
  total: number;
  counts: Record<CoverageTier, number>;
  items: AreaCoverageItem[];
  data_source: string;
  last_updated: string;
}

export interface AreaCoverageStats {
  total_areas: number;
  curated_count: number;
  dld_only_count: number;
  by_tier: Record<CoverageTier, number>;
  samples_total_sales: number;
  samples_total_rents: number;
  area_gaps: string[];
  data_source: string;
  last_updated: string;
}

export interface AreaLimitedDetail {
  id: string;
  slug: string;
  name: string;
  coverage_tier: CoverageTier;
  dld: AreaDldBlock;
  data_source: string;
  last_updated: string;
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

export interface AreaDldBlock {
  // Null for canonical-only areas (no current-snapshot row in dld_areas)
  dld_area_id: string | null;
  dld_name: string;
  median_price_per_sqft: number | null;
  median_annual_rent: number | null;
  median_rent_per_sqft: number | null;
  avg_price_per_sqft: number | null;
  avg_annual_rent: number | null;
  avg_rent_per_sqft: number | null;
  rental_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  sales_count: number;
  rent_count_2026: number;
  building_count: number;
  confidence: 'low' | 'medium' | 'high';
  // From land_registry ETL
  freehold_pct?: number | null;
  registered_pct?: number | null;
  total_parcels?: number | null;
  land_type_mix?: Record<string, number> | null;
}

export interface AreaDetail extends Area {
  latest: AreaLatestSnapshot | null;
  history: AreaSnapshotPoint[];
  dld?: AreaDldBlock | null;
  data_source?: string;
  last_updated?: string;
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

export interface CompareDldBlock {
  dld_area_id: string;
  dld_name: string;
  median_price_per_sqft: number | null;
  median_annual_rent: number | null;
  median_rent_per_sqft: number | null;
  rental_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  sales_count: number;
  rent_count_2026: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface CompareAreaData {
  id: string;
  name: string;
  name_arabic: string | null;
  area_type: string;
  // All curated metrics now nullable — DLD-only areas have none of these
  latest_price_per_sqft: number | null;
  latest_yield: number | null;
  latest_sale_price: number | null;
  appreciation_1y: number | null;
  appreciation_3y: number | null;
  occupancy_rate: number | null;
  demand_score: number | null;
  risk_score: number | null;
  investment_score: number | null;
  history: CompareSnapshotPoint[];
  dld?: CompareDldBlock | null;
  coverage_tier?: CoverageTier;
}

export interface CompareResponse {
  areas: CompareAreaData[];
  data_source?: string;
  last_updated?: string;
}

// ---------- DLD endpoints ----------

export interface DldAttribution {
  data_source: string;
  last_updated: string;
}

export interface DldAreaListItem {
  id: string;
  name: string;
  name_norm: string;
  median_price_per_sqft: number | null;
  median_annual_rent: number | null;
  median_rent_per_sqft: number | null;
  rental_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  sales_count: number;
  rent_count_2026: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface DldAreaListResponse extends DldAttribution {
  count: number;
  total_available: number;
  items: DldAreaListItem[];
}

export interface PriceHistoryPoint {
  year: number;
  avg_ppsf: number | null;
  avg_ppsf_ready: number | null;
  avg_ppsf_offplan: number | null;
  median_ppsf: number | null;
  transaction_count: number;
  offplan_pct: number | null;
}

export interface DldAreaDetail extends DldAreaListItem {
  building_count: number;
  avg_price_per_sqft: number | null;
  avg_annual_rent: number | null;
  avg_rent_per_sqft: number | null;
  // 5-year historical signals from etl_dld_history.py
  price_appreciation_1y_pct: number | null;
  price_appreciation_3y_pct: number | null;
  price_appreciation_5y_pct: number | null;
  cagr_5y_pct: number | null;
  years_of_history: number;
  price_history: PriceHistoryPoint[];
}

export interface DldPriceHistoryResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string;
  points: PriceHistoryPoint[];
  appreciation_1y_pct: number | null;
  appreciation_3y_pct: number | null;
  appreciation_5y_pct: number | null;
  appreciation_10y_pct: number | null;
  cagr_5y_pct: number | null;
  cagr_10y_pct: number | null;
  years_of_history: number;
}

export interface TopAppreciationItem {
  area_name_norm: string;
  area_name_display: string;
  appreciation_5y_pct: number;
  cagr_5y_pct: number | null;
  appreciation_1y_pct: number | null;
  latest_avg_ppsf: number | null;
  years_of_data: number;
}

export interface TopAppreciationResponse extends DldAttribution {
  count: number;
  items: TopAppreciationItem[];
}

export interface RentHistoryPoint {
  year: number;
  avg_annual_rent: number | null;
  avg_rent_per_sqft: number | null;
  median_annual_rent: number | null;
  contract_count: number;
  renewal_rate_pct: number | null;
}

export interface YieldHistoryPoint {
  year: number;
  gross_yield_pct: number | null;
  sale_ppsf: number | null;
  rent_psf: number | null;
  yield_delta_yoy_pct: number | null;
  sample_score: number;
}

export interface DldRentHistoryResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string;
  points: RentHistoryPoint[];
  years_of_history: number;
}

export interface DldYieldHistoryResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string;
  points: YieldHistoryPoint[];
  years_of_history: number;
  trend: 'rising' | 'falling' | 'flat' | null;
}

export interface BedroomBenchmarkRow {
  bedroom_type: string;
  reg_type: 'ready' | 'off_plan' | string;
  year: number;
  avg_price_aed: number | null;
  median_price_aed: number | null;
  avg_ppsf: number | null;
  transaction_count: number;
}
export interface AreaBedroomPricesResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string | null;
  rows: BedroomBenchmarkRow[];
  total_rows: number;
}

export interface AreaCommunityProfile extends DldAttribution {
  community_code: number | null;
  area_name_en: string | null;
  area_name_ar: string | null;
  sector: number | null;
  total_population: number | null;
  area_km2: number | null;
  population_density: number | null;
  density_tier: 'very_high' | 'high' | 'medium' | 'low' | null;
  density_rank: number | null;
  density_rank_total: number | null;
  matched: boolean;
}

export interface BuildingRentHistoryPoint {
  year: number;
  avg_annual_rent: number | null;
  median_annual_rent: number | null;
  avg_rent_per_sqft: number | null;
  contract_count: number;
  new_count: number;
  renew_count: number;
}

export interface DldBuildingRentHistoryResponse extends DldAttribution {
  building_id: string;
  project_name: string | null;
  area_name: string | null;
  points: BuildingRentHistoryPoint[];
  years_of_history: number;
}

export interface UpcomingAvailabilityItem {
  property_sub_type: string;
  contract_count: number;
  estimated_available: number;
  avg_last_rent: number | null;
  renewal_probability_pct: number | null;
}

export interface UpcomingAvailabilityResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string;
  window_days: number;
  horizon_month_end: string;
  total_expiring: number;
  total_estimated_available: number;
  by_sub_type: UpcomingAvailabilityItem[];
}

export interface LeaseExpiryMonthBucket {
  expiry_month: string;
  contract_count: number;
  estimated_available: number;
  avg_last_rent: number | null;
  renewal_probability_pct: number | null;
}

export interface BuildingLeaseExpiryResponse extends DldAttribution {
  building_id: string;
  project_name: string | null;
  area_name: string | null;
  months: LeaseExpiryMonthBucket[];
  total_expiring: number;
  total_estimated_available: number;
}

export interface AreaLifestyleScoreResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string | null;
  metro_score: number | null;
  mall_score: number | null;
  landmark_score: number | null;
  overall_score: number | null;
  nearest_metro: string | null;
  nearest_mall: string | null;
  nearest_landmark: string | null;
  metro_stations_count: number;
}

export interface CanonicalAreaBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CanonicalAreaItem {
  id: string;
  area_name: string;
  area_name_upper: string;
  area_name_slug: string;
  area_name_ar: string | null;
  source_datasets: string[];
  first_seen_year: number | null;
  occurrence_count: number;
  // Geocoding payload — ~93% of canonical areas have coords.
  latitude: number | null;
  longitude: number | null;
  bbox: CanonicalAreaBbox | null;
  // GeoJSON Polygon / MultiPolygon for map rendering (~49% coverage).
  polygon: unknown | null;
  coords_source: string | null;
  coords_confidence: string | null;
}

export interface CanonicalAreasResponse extends DldAttribution {
  count: number;
  min_occurrences: number;
  coords_coverage: number;
  polygon_coverage: number;
  items: CanonicalAreaItem[];
}

// ---------------------------------------------------------------------------
// Dashboard data — Bloomberg-style infographic payload from one call
// ---------------------------------------------------------------------------

export interface DashboardTicker {
  sales_2026_ytd: number;
  volume_2026_aed: number;
  top_yield_pct: number | null;
  top_5y_growth_pct: number | null;
  active_brokers: number;
  areas_tracked: number;
}

export interface DashboardKpi {
  label: string;
  value: number;
  unit: 'count' | 'aed' | 'pct';
  sublabel?: string | null;
  delta_pct?: number | null;
  delta_label?: string | null;
}

export interface SalesCompositionSlice {
  label: string;
  pct: number;
  volume_aed: number;
  transaction_count: number;
}

export interface DashboardPriceHistoryPoint {
  year: number;
  avg_ppsf_ready: number | null;
  avg_ppsf_offplan: number | null;
  avg_ppsf_all: number | null;
  transaction_count: number;
}

export interface TopAreaItem {
  rank: number;
  area_name: string;
  value: number;
  secondary?: number | null;
  sample_count?: number | null;
}

export interface ActivityPoint {
  year: number;
  transaction_count: number;
  volume_aed: number;
  offplan_count: number;
  ready_count: number;
}

export interface YieldTrendPoint {
  year: number;
  avg_gross_yield_pct: number;
  area_count: number;
}

export interface SupplyPipelineItem {
  rank: number;
  area_name: string;
  project_count: number;
  total_units: number | null;
  offplan_pct: number | null;
}

export interface BrokerLicensePoint {
  year: number;
  new_licenses: number;
}

export interface BrokerFirmItem {
  rank: number;
  firm_name: string;
  broker_count: number;
}

export interface BrokerStats {
  licenses_per_year: BrokerLicensePoint[];
  top_firms: BrokerFirmItem[];
  total_active: number;
}

export interface DataIntelligenceFooter {
  last_updated: string;
  records_analyzed: number;
  data_sources: string[];
  next_update: string | null;
  confidence: string;
}

// ---------------------------------------------------------------------------
// Opportunities-filtered, similar areas, market timing, rent rankings
// ---------------------------------------------------------------------------

export type SupplyRiskTier = 'low' | 'medium' | 'high';
export type OpportunityConfidence = 'low' | 'medium' | 'high';

export interface OpportunityFilteredItem {
  area_id: string;
  area_name: string;
  area_name_norm: string;
  rank: number;
  score: number;
  gross_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  appreciation_5y_pct: number | null;
  cagr_5y_pct: number | null;
  median_price_per_sqft: number | null;
  transaction_count: number;
  supply_risk: SupplyRiskTier | null;
  offplan_pct: number | null;
  freehold_pct: number | null;
  investor_visa_eligible: boolean;
  sales_sample_count: number;
  rent_sample_count: number;
  confidence: OpportunityConfidence;
  reasoning: string[];
}

export interface OpportunityScoreFormula {
  yield_weight: number;
  rent_growth_weight: number;
  appreciation_weight: number;
  demand_weight: number;
  low_supply_risk_weight: number;
}

export interface OpportunitiesFilteredResponse extends DldAttribution {
  goal: string;
  risk: string;
  budget_aed_max: number | null;
  property_type: string | null;
  count: number;
  formula: OpportunityScoreFormula;
  items: OpportunityFilteredItem[];
}

export interface SimilarAreaItem {
  rank: number;
  area_id: string;
  area_name: string;
  area_name_norm: string;
  median_price_per_sqft: number | null;
  rental_yield_pct: number | null;
  similarity_score: number;
  reason: string;
}

export interface SimilarAreasResponse extends DldAttribution {
  source_area_name: string;
  source_yield_pct: number | null;
  source_price_per_sqft: number | null;
  count: number;
  items: SimilarAreaItem[];
}

export interface MarketTimingSignal {
  label: string;
  value: string;
  tone: 'positive' | 'neutral' | 'negative';
  detail: string;
}

export interface MarketTimingResponse extends DldAttribution {
  area_name: string;
  area_name_norm: string;
  verdict: 'good_time' | 'neutral' | 'caution';
  confidence: 'low' | 'medium' | 'high';
  headline: string;
  signals: MarketTimingSignal[];
  reasoning: string[];
  current_yield_pct: number | null;
  yield_5y_avg_pct: number | null;
  current_ppsf: number | null;
  ppsf_5y_peak: number | null;
  latest_offplan_pct: number | null;
}

export interface RentRankingItem {
  area_name: string;
  area_name_norm: string;
  prop_sub_type: string;
  size_band: string;
  median_annual_rent: number;
  median_rent_per_sqft: number;
  p25_annual_rent: number | null;
  p75_annual_rent: number | null;
  sample_count: number;
}

export interface RentRankingResponse extends DldAttribution {
  direction: 'cheapest' | 'expensive';
  size_category: string;
  prop_sub_type: string;
  count: number;
  items: RentRankingItem[];
}

// ---------------------------------------------------------------------------
// Comprehensive DLD-grounded ROI calculator
// ---------------------------------------------------------------------------

export type RoiPaymentType = 'cash' | 'mortgage';

export interface RoiCalcMortgage {
  down_payment_pct: number;
  interest_rate_pct: number;
  term_years: number;
}

export interface RoiCalcRequest {
  area_name: string;
  property_type: 'studio' | '1br' | '2br' | '3br' | '4br';
  size_sqm: number;
  purchase_price_aed: number;
  payment: RoiPaymentType;
  mortgage?: RoiCalcMortgage;
  expected_annual_rent_aed?: number;
  service_charge_aed_per_sqft?: number;
  maintenance_pct?: number;
  property_management_pct?: number;
  vacancy_rate_pct?: number;
}

export interface RoiCalcCostBreakdown {
  dld_transfer_aed: number;
  agency_aed: number;
  agency_vat_aed: number;
  trustee_aed: number;
  mortgage_registration_aed: number;
  total_buying_cost_aed: number;
  notes: string[];
}

export interface RoiCalcRentalReturns {
  gross_rent_aed: number;
  operating_expenses_aed: number;
  net_rent_aed: number;
  gross_yield_pct: number;
  net_yield_pct: number;
  monthly_cash_flow_aed: number | null;
  annual_cash_flow_aed: number | null;
}

export interface RoiCalcCapitalGrowth {
  current_value_aed: number;
  projected_value_5y_aed: number;
  cagr_pct_used: number;
  cagr_source: string;
  total_5y_return_aed: number;
  total_5y_return_pct: number;
  irr_estimate_pct: number | null;
}

export interface RoiCalcScenario {
  label: string;
  annual_rent_aed: number;
  net_yield_pct: number;
  annual_cash_flow_aed: number | null;
}

export interface RoiCalcSensitivityItem {
  scenario: string;
  delta_annual_cash_flow_aed: number | null;
  delta_net_yield_pp: number | null;
  note: string;
}

export interface RoiCalcBenchmark {
  your_value: number;
  area_median: number | null;
  percentile_rank: number | null;
  verdict: string;
}

export interface RoiCalcCurrency {
  code: string;
  symbol: string;
  price_local: number;
}

export interface RoiCalcInsight {
  summary: string;
  bullets: string[];
}

export interface RoiCalcResponse extends DldAttribution {
  area_name: string;
  property_type: string;
  size_sqm: number;
  purchase_price_aed: number;
  payment: RoiPaymentType;
  total_cash_needed_aed: number;
  total_investment_inc_costs_aed: number;
  rental_returns: RoiCalcRentalReturns;
  capital_growth: RoiCalcCapitalGrowth;
  payback_years: number | null;
  yield_vs_market: RoiCalcBenchmark;
  price_vs_market: RoiCalcBenchmark;
  scenarios: RoiCalcScenario[];
  sensitivity: RoiCalcSensitivityItem[];
  tax_advantages: string[];
  effective_net_yield_after_tax_pct: number;
  fx_rates_disclaimer: string;
  currencies: RoiCalcCurrency[];
  insight: RoiCalcInsight;
  cost_breakdown: RoiCalcCostBreakdown;
  defaults_used: Record<string, number | string>;
}

export interface DashboardDataResponse extends DldAttribution {
  ticker: DashboardTicker;
  kpis: DashboardKpi[];
  sales_composition: SalesCompositionSlice[];
  sales_composition_total_aed: number;
  price_history: DashboardPriceHistoryPoint[];
  top_yield_areas: TopAreaItem[];
  top_appreciation_areas: TopAreaItem[];
  activity: ActivityPoint[];
  rent_growth_leaders: TopAreaItem[];
  yield_trend: YieldTrendPoint[];
  yield_trend_direction: 'rising' | 'falling' | 'flat' | null;
  supply_pipeline: SupplyPipelineItem[];
  broker_stats: BrokerStats;
  intelligence: DataIntelligenceFooter;
  cached?: boolean;
}

export interface MarketOverviewResponse extends DldAttribution {
  total_sales: number;
  total_volume_aed: number;
  areas_covered: number;
  active_brokers: number;
  buildings_tracked: number;
  rent_contracts: number;
  avg_yield_pct: number | null;
  top_yield_area: string | null;
  top_yield_pct: number | null;
  top_appreciation_area: string | null;
  top_appreciation_pct: number | null;
  offplan_percentage: number | null;
  cached: boolean;
}

export interface DldAreaDetailResponse extends DldAttribution {
  area: DldAreaDetail;
}

export interface DldStatsResponse extends DldAttribution {
  total_areas: number;
  areas_with_metrics: number;
  areas_with_full_yield: number;
  total_buildings: number;
  total_active_brokers: number;
  total_rent_benchmark_cells: number;
}

export type BuildingType = 'tower' | 'complex' | 'villa_community' | 'under_construction';
export type DemandSignal = 'very_high' | 'high' | 'moderate' | 'low';

export interface DldBuildingItem {
  id: string;
  project_name: string | null;
  master_project: string | null;
  area_name: string | null;
  prop_sub_type: string | null;
  flats: number | null;
  floors: number | null;
  avg_annual_rent: number | null;
  avg_rent_per_sqft: number | null;
  active_rent_count: number;
  occupancy_proxy_pct: number | null;
  is_freehold: boolean | null;
  is_offplan: boolean | null;
  creation_date: string | null;
  // Derived
  total_annual_income: number | null;
  income_range_label: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  building_type: BuildingType | null;
  building_type_label: string | null;
  building_type_emoji: string | null;
  is_community_aggregate: boolean;
  siblings_in_master_project: number | null;
  age_years: number | null;
  rent_psf_vs_area_delta: number | null;
  rent_psf_vs_area_pct: number | null;
  area_median_rent_psf: number | null;
  demand_signal: DemandSignal | null;
  // Building-name classification (Fix 4). When is_identifiable=false the
  // row represents an area / developer / master-project label rather than a
  // specific tower — UI should use display_name and avoid promising building
  // economics.
  building_name_clean?: string | null;
  building_name_type?:
    | 'real_building'
    | 'sub_project'
    | 'master_project'
    | 'developer_name'
    | 'area_name'
    | 'no_name'
    | null;
  display_name?: string | null;
  is_identifiable?: boolean;
  // Provenance — 'dld_official' (the 47-row published buildings CSV) or
  // 'ejari_derived' (synthetic per-tower entity extracted from the rent
  // stream itself). Defaults to 'dld_official' on legacy responses.
  data_source?: 'dld_official' | 'ejari_derived';
  // Property category for the 5-tab UI. Derived buildings only.
  property_category?:
    | 'apartment' | 'villa' | 'hotel_apt'
    | 'office' | 'retail' | 'warehouse'
    | 'labor_camp' | 'whole_building' | 'other'
    | null;
}

export interface AreaCategoryBreakdownItem {
  property_category: string;
  label: string;
  emoji: string;
  building_count: number;
}

export interface AreaCategoryBreakdownResponse extends DldAttribution {
  area_name_norm: string;
  area_name_display: string | null;
  total_buildings: number;
  items: AreaCategoryBreakdownItem[];
}

export interface DldCommunityItem {
  slug: string;
  master_project: string;
  primary_area_name: string | null;
  area_count: number;
  building_count: number;
  total_contracts: number;
  avg_annual_rent: number | null;
  total_annual_income: number | null;
  income_range_label: string | null;
  confidence: string;
}

export interface DldCommunitiesResponse extends DldAttribution {
  count: number;
  total_available: number;
  items: DldCommunityItem[];
}

// ---------------------------------------------------------------------------
// Dashboard pulse — 7-widget aggregator
// ---------------------------------------------------------------------------

export interface MarketOverviewMetric {
  name: string;
  value: string;
  period?: string | null;
}

export interface MarketOverview {
  period_label: string;
  metrics: MarketOverviewMetric[];
  source: string;
}

export interface ScatterMatrixPoint {
  area_name_norm: string;
  area_name_display: string;
  yield_pct: number;
  appreciation_5y_pct: number;
  sample_score: number;
  quadrant: 'best_investment' | 'income_focus' | 'growth_focus' | 'avoid';
}

export interface RentVsBuyGauge {
  payback_years: number;
  signal: 'buy' | 'neutral' | 'rent';
  based_on_areas: number;
  avg_sale_price_aed: number;
  avg_annual_rent_aed: number;
}

export interface HotAreaItem {
  area_name_norm: string;
  area_name_display: string;
  txn_count_latest: number;
  txn_count_prior: number;
  pct_change_yoy: number;
  trend: 'up' | 'down' | 'flat';
}

export interface OffplanArea {
  area_name_norm: string;
  area_name_display: string;
  offplan_count: number;
  offplan_volume_aed: number;
  offplan_share_pct: number;
}

export interface OffplanPipeline {
  total_offplan_volume_aed: number;
  total_offplan_count: number;
  top_areas: OffplanArea[];
}

export interface DataFreshness {
  transactions_year_range: string;
  rents_year_range: string;
  snapshot_date: string;
  last_etl_run: string;
}

export interface DashboardPulseResponse extends DldAttribution {
  market_overview: MarketOverview;
  matrix_points: ScatterMatrixPoint[];
  rent_vs_buy: RentVsBuyGauge | null;
  hot_areas: HotAreaItem[];
  offplan: OffplanPipeline | null;
  freshness: DataFreshness;
}

export interface DldBuildingsResponse extends DldAttribution {
  count: number;
  total_available: number;
  items: DldBuildingItem[];
}

// Building X-Ray detail

export interface DldBuildingAreaContext {
  dld_area_id: string;
  name: string;
  name_norm: string;
  community_name?: string | null;
  median_price_per_sqft: number | null;
  median_annual_rent: number | null;
  median_rent_per_sqft: number | null;
  rental_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  sales_count: number;
  rent_count_2026: number;
}

export interface DldBuildingDetail extends DldBuildingItem {
  swimming_pools: number | null;
  car_parks: number | null;
  elevators: number | null;
  bld_levels: number | null;
  is_offplan: boolean | null;
  implied_yield_pct: number | null;
  estimated_unit_size_sqft: number | null;
  estimated_unit_price: number | null;
  area_context: DldBuildingAreaContext | null;
}

export interface DldBuildingDetailResponse {
  data_source: string;
  last_updated: string;
  building: DldBuildingDetail;
}

export interface DldBuildingsComparableResponse {
  data_source: string;
  last_updated: string;
  base_building_id: string;
  count: number;
  items: DldBuildingItem[];
}

export interface DldAreaTopBuildingsResponse {
  data_source: string;
  last_updated: string;
  area_name: string;
  count: number;
  items: DldBuildingItem[];
}

export interface DldBrokerItem {
  broker_number: string;
  full_name: string;
  gender: string | null;
  is_active: boolean;
  license_start_date: string | null;
  license_end_date: string | null;
  phone: string | null;
  webpage: string | null;
  real_estate_name: string | null;
  // Estimated nationality from name patterns. NEVER verified — DLD does
  // not publish broker nationality. UI must label results "Estimated".
  detected_nationality: string | null;
  detected_language: string | null;
  nationality_flag: string | null;
}

export interface DldBrokersResponse extends DldAttribution {
  count: number;
  total_available: number;
  items: DldBrokerItem[];
}

export interface BrokerNationalityBucket {
  nationality: string;
  flag: string;
  count: number;
  language: string;
}

export interface BrokerNationalityStats extends DldAttribution {
  total: number;
  estimated_disclaimer: string;
  buckets: BrokerNationalityBucket[];
}

export type SizeCategory = 'studio' | '1br' | '2br' | '3br' | '4br';

export interface RentCheckRequest {
  area_name: string;
  size_sqm?: number;
  size_category?: SizeCategory;
  annual_rent: number;
  prop_sub_type?: string;
}

export interface RentCheckSuggestion {
  area_name: string;
  median_annual_rent: number;
  median_rent_per_sqft: number;
  saving_pct: number;
  sample_size: number;
}

export interface RentCheckResponse extends DldAttribution {
  user_rent: number;
  area_median: number;
  percentile: number;
  verdict: 'above_market' | 'fair' | 'below_market';
  percentage_diff: number;
  sample_size: number;
  yoy_trend: number | null;
  size_band: string;
  confidence: 'low' | 'medium' | 'high';
  low_confidence?: boolean;
  area_name_display?: string | null;
  area_name_norm?: string | null;
  median_price_per_sqft?: number | null;
  avg_price_per_sqft?: number | null;
  suggested_areas: RentCheckSuggestion[];
}

// Wizard / matching / alerts / consultation

export type BrokerGoal = 'buy' | 'rent' | 'sell' | 'invest';
export type BudgetBand =
  | 'under_500k'
  | '500k_1m'
  | '1m_3m'
  | '3m_5m'
  | '5m_plus';
export type LangPref =
  | 'arabic'
  | 'english'
  | 'russian'
  | 'chinese'
  | 'hindi'
  | 'filipino'
  | 'other';

export interface BrokerMatchRequest {
  goal: BrokerGoal;
  preferred_area_norm?: string;
  language?: LangPref;
  budget_band?: BudgetBand;
}

export interface BrokerMatchItem {
  broker_number: string;
  full_name: string;
  gender: string | null;
  real_estate_name: string | null;
  phone: string | null;
  webpage: string | null;
  license_start_date: string | null;
  license_end_date: string | null;
  is_active: boolean;
  detected_language: string;
  detected_nationality: string | null;
  nationality_flag: string | null;
  company_size_active_brokers: number;
  license_status: 'active' | 'expiring_soon' | 'expired';
  days_until_expiry: number | null;
}

export interface BrokerMatchResponse extends DldAttribution {
  count: number;
  items: BrokerMatchItem[];
}

export interface TopCompanyItem {
  real_estate_name: string;
  active_broker_count: number;
}

export interface TopCompaniesResponse extends DldAttribution {
  count: number;
  items: TopCompanyItem[];
}

export interface RentAlertCreate {
  email: string;
  area_name_norm: string;
  area_name_display?: string;
  size_category?: SizeCategory;
  prop_sub_type?: string;
}

export interface RentAlertOut extends DldAttribution {
  id: string;
  email: string;
  area_name_norm: string;
  area_name_display: string | null;
  size_category: string | null;
  prop_sub_type: string | null;
  is_active: boolean;
}

export interface BrokerConsultationRequestBody {
  broker_number: string;
  full_name: string;
  whatsapp: string;
  email?: string;
  budget_band?: BudgetBand;
  goal?: BrokerGoal;
  message?: string;
}

export interface BrokerConsultationResponse {
  success: boolean;
  message: string;
  broker_full_name: string;
  broker_real_estate_name: string | null;
  lead_id: string;
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

export type SupplyRisk = 'low' | 'medium' | 'high';

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
  // DLD-grounded signals — present when the area has a DldArea linkage.
  // Frontend renders these as a dedicated "Real DLD signals" panel with
  // explicit source attribution so users can tell DLD facts apart from
  // curated snapshot heuristics.
  gross_yield_pct: number | null;
  rent_growth_yoy_pct: number | null;
  appreciation_5y_pct: number | null;
  cagr_5y_pct: number | null;
  supply_risk: SupplyRisk | null;
  supply_risk_offplan_pct: number | null;
  dld_year_latest: number | null;
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
  expected_gross_yield: number;
  expected_net_yield?: number;
  service_charges?: number;
  strategy_type: DealStrategy;
  risk_level: DealRisk;
  confidence_score: number;
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

// ---------- Developers + Off-plan ----------

export interface DeveloperCard {
  slug: string;
  name: string;
  total_projects: number;
  offplan_projects: number;
  total_units: number;
  areas_served: number;
  total_value_aed: number | null;
  earliest_year: number | null;
  track_record_score: number;
  track_record_label: string;
  top_areas: string[];
}

export interface DevelopersListResponse {
  total: number;
  items: DeveloperCard[];
  data_source: string;
  coverage_note: string;
}

export interface DeveloperProjectRow {
  project_slug: string;
  master_project: string;
  area_name: string | null;
  buildings_count: number;
  total_units: number;
  is_offplan: boolean;
  earliest_year: number | null;
  latest_year: number | null;
  avg_ppsf: number | null;
  status_key: OffplanStatusKey;
  status_label: string;
}

export interface DeveloperDetail {
  slug: string;
  name: string;
  summary: DeveloperCard;
  projects: DeveloperProjectRow[];
  data_source: string;
}

export type OffplanStatusKey = 'active' | 'completed' | 'coming_soon';

export interface OffplanProjectCard {
  slug: string;
  master_project: string;
  area_name: string | null;
  area_slug: string | null;
  developer_slug: string;
  developer_name: string;
  buildings_count: number;
  total_units: number;
  earliest_year: number | null;
  latest_year: number | null;
  offplan_buildings: number;
  ready_buildings: number;
  status_key: OffplanStatusKey;
  status_label: string;
  latest_offplan_year: number | null;
  latest_ready_year: number | null;
  offplan_ppsf: number | null;
  ready_ppsf: number | null;
  price_gain_pct: number | null;
}

export interface OffplanListResponse {
  total: number;
  items: OffplanProjectCard[];
  data_source: string;
  counts?: Record<string, number>;
}

export interface OffplanPriceContext {
  avg_ppsf_offplan: number | null;
  avg_ppsf_ready: number | null;
  delta_pct: number | null;
  sample_offplan_sales: number;
  sample_ready_sales: number;
}

export interface OffplanProjectDetail extends OffplanProjectCard {
  sub_projects: string[];
  price_context: OffplanPriceContext;
  data_source: string;
}


export interface RegisterInterestRequest {
  project_slug: string;
  full_name: string;
  whatsapp?: string | null;
  email?: string | null;
  budget_aed?: number | null;
  timeline?: string | null;
  message?: string | null;
}

export interface RegisterInterestResponse {
  lead_id: string;
  status: string;
  message: string;
}
