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
