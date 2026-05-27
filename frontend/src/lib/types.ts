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
