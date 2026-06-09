import type {
  Area,
  AreaDetail,
  AreaStats,
  AreaCoverageResponse,
  AreaCoverageStats,
  AreaLimitedDetail,
  ROICalculateRequest,
  ROICalculateResponse,
  DashboardSummary,
  CompareResponse,
  AdvisorQueryRequest,
  AdvisorQueryResponse,
  ConfidenceReport,
  OpportunityResult,
  RankingResult,
  AlertOut,
  AlertCreateRequest,
  AlertTypesResponse,
  Methodology,
  MeResponse,
  AuditLogEntry,
  ApiKeyPublic,
  ApiKeyCreateResponse,
  ApiKeyCreateRequest,
  AIAnalyticsResponse,
  OpportunityExplanation,
  OpportunitiesResponse,
  MarketBrief,
  AreaInsight,
  TrendsResponse,
  Broker,
  BrokerApplication,
  BrokerApplicationCreate,
  BrokerApproveResponse,
  BrokerLoginResponse,
  ConsultationRequestResponse,
  Deal,
  DealCreate,
  DealUpdate,
  InvestorLead,
  LeadCreate,
  LeadUpdate,
  OpportunityFeedResponse,
  DldAreaListResponse,
  DldAreaDetailResponse,
  DldPriceHistoryResponse,
  AreaCategoryBreakdownResponse,
  DldCommunitiesResponse,
  AreaLifestyleScoreResponse,
  DashboardPulseResponse,
  BuildingLeaseExpiryResponse,
  DldBuildingRentHistoryResponse,
  DldRentHistoryResponse,
  DldYieldHistoryResponse,
  AreaBedroomPricesResponse,
  AreaCommunityProfile,
  MapAreasResponse,
  MapBuildingsResponse,
  UpcomingAvailabilityResponse,
  CanonicalAreasResponse,
  DashboardDataResponse,
  MarketOverviewResponse,
  MarketTimingResponse,
  OpportunitiesFilteredResponse,
  RentRankingResponse,
  RoiCalcRequest,
  RoiCalcResponse,
  SimilarAreasResponse,
  DldStatsResponse,
  DldBuildingsResponse,
  TopAppreciationResponse,
  DldBuildingDetailResponse,
  DldBuildingsComparableResponse,
  DldAreaTopBuildingsResponse,
  BrokerNationalityStats,
  DldBrokersResponse,
  DldBrokerItem,
  RentCheckRequest,
  RentCheckResponse,
  BrokerMatchRequest,
  BrokerMatchResponse,
  TopCompaniesResponse,
  RentAlertCreate,
  RentAlertOut,
  BrokerConsultationRequestBody,
  BrokerConsultationResponse,
  DevelopersListResponse,
  DeveloperDetail,
  OffplanListResponse,
  OffplanProjectDetail,
  RegisterInterestRequest,
  RegisterInterestResponse,
  OfficialProjectListResponse,
  OfficialProjectDetail,
  OfficialDeveloperListResponse,
  OfficialDeveloperDetail,
} from './types';
import { getBrokerToken } from './brokerAuth';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'https://api.floxcy.com';

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOpts extends RequestInit {
  revalidate?: number | false;
  withCredentials?: boolean;
}

async function request<T>(path: string, init?: RequestOpts): Promise<T> {
  const { revalidate, withCredentials, ...rest } = init ?? {};
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    ...rest,
    credentials: withCredentials ? 'include' : rest.credentials,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(rest.headers ?? {}),
    },
    next: revalidate === false ? { revalidate: 0 } : { revalidate: revalidate ?? 60 },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw new ApiError(
      `API ${res.status} ${res.statusText} for ${path}`,
      res.status,
      body
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Existing endpoints ----------

export async function getAreas(): Promise<Area[]> {
  return request<Area[]>('/api/v1/areas', { revalidate: 60 });
}

export async function getAreaStats(): Promise<AreaStats> {
  return request<AreaStats>('/api/v1/areas/stats', { revalidate: 300 });
}

export async function getAllAreas(opts?: {
  area_type?: string;
  sort_by?: 'rent_count' | 'investment_score' | 'yield' | 'name';
  min_samples?: number;
  coverage_tier?: 'full' | 'partial' | 'limited' | 'none';
}): Promise<AreaCoverageResponse> {
  const params = new URLSearchParams();
  if (opts?.area_type) params.set('area_type', opts.area_type);
  if (opts?.sort_by) params.set('sort_by', opts.sort_by);
  if (opts?.min_samples != null) params.set('min_samples', String(opts.min_samples));
  if (opts?.coverage_tier) params.set('coverage_tier', opts.coverage_tier);
  const q = params.toString();
  return request<AreaCoverageResponse>(
    `/api/v1/areas/all${q ? `?${q}` : ''}`,
    { revalidate: 600 }
  );
}

export async function getAreaCoverageStats(): Promise<AreaCoverageStats> {
  return request<AreaCoverageStats>('/api/v1/areas/coverage-stats', {
    revalidate: 600,
  });
}

/**
 * Area detail. Accepts a curated UUID OR a DLD name_norm slug.
 * Returns either AreaDetail (full) or AreaLimitedDetail (DLD-only).
 * Use the presence of `latest` to discriminate.
 */
export async function getArea(slug: string): Promise<AreaDetail | AreaLimitedDetail> {
  return request<AreaDetail | AreaLimitedDetail>(
    `/api/v1/areas/${encodeURIComponent(slug)}`,
    { revalidate: 60 }
  );
}

export async function getAreaConfidence(id: string): Promise<ConfidenceReport & { area_id: string; area_name: string }> {
  return request(`/api/v1/areas/${id}/confidence`, { revalidate: 60 });
}

export async function calculateROI(
  data: ROICalculateRequest
): Promise<ROICalculateResponse> {
  return request<ROICalculateResponse>('/api/v1/roi/calculate', {
    method: 'POST',
    body: JSON.stringify(data),
    revalidate: false,
  });
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/api/v1/dashboard/summary', { revalidate: 300 });
}

export async function compareAreas(ids: string[]): Promise<CompareResponse> {
  const q = encodeURIComponent(ids.join(','));
  return request<CompareResponse>(`/api/v1/areas/compare?ids=${q}`, { revalidate: 60 });
}

export async function advisorQuery(
  data: AdvisorQueryRequest
): Promise<AdvisorQueryResponse> {
  return request<AdvisorQueryResponse>('/api/v1/advisor/query', {
    method: 'POST',
    body: JSON.stringify(data),
    revalidate: false,
  });
}

// ---------- New: opportunities, rankings, alerts, methodology ----------

export async function getOpportunities(opts?: {
  type?: string;
  min_score?: number;
  limit?: number;
  sort_by?: 'score' | 'yield' | 'appreciation';
}): Promise<OpportunitiesResponse> {
  // Legacy callers (home/dashboard widgets, areas pages) want only area-derived
  // signals so the existing OpportunityResult shape is guaranteed. The merged
  // feed is exposed via `getOpportunitiesFeed`.
  const params = new URLSearchParams({ kind: 'signals' });
  if (opts?.type) params.set('type', opts.type);
  if (opts?.min_score != null) params.set('min_score', String(opts.min_score));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sort_by) params.set('sort_by', opts.sort_by);
  return request<OpportunitiesResponse>(
    `/api/v1/opportunities?${params.toString()}`,
    { revalidate: 300 }
  );
}

export async function recomputeOpportunities(): Promise<{ status: string; cleared_keys: number; ts: string }> {
  return request('/api/v1/opportunities/recompute', {
    method: 'POST',
    revalidate: false,
    withCredentials: true,
  });
}

export async function explainOpportunity(areaId: string): Promise<OpportunityExplanation> {
  return request<OpportunityExplanation>(
    `/api/v1/opportunities/${areaId}/explain`,
    { method: 'POST', revalidate: false }
  );
}

export async function getAreaUndervaluation(id: string): Promise<OpportunityResult> {
  return request<OpportunityResult>(`/api/v1/areas/${id}/undervaluation`, {
    revalidate: 300,
  });
}

// ---------- Insights (P2) ----------

export async function getMarketBrief(): Promise<MarketBrief> {
  return request<MarketBrief>('/api/v1/insights/market-brief', {
    revalidate: 3600,
  });
}

export async function getAreaInsight(id: string): Promise<AreaInsight> {
  return request<AreaInsight>(`/api/v1/insights/area/${id}`, {
    revalidate: 3600,
  });
}

export async function getTrends(): Promise<TrendsResponse> {
  return request<TrendsResponse>('/api/v1/insights/trends', {
    revalidate: 3600,
  });
}

export async function getRankings(by: string, limit = 20): Promise<{
  by: string;
  count: number;
  results: RankingResult[];
}> {
  return request(`/api/v1/rankings?by=${encodeURIComponent(by)}&limit=${limit}`, {
    revalidate: 300,
  });
}

export async function getMethodology(): Promise<Methodology> {
  return request<Methodology>('/api/v1/methodology', { revalidate: 3600 });
}

export async function getAlerts(): Promise<AlertOut[]> {
  return request<AlertOut[]>('/api/v1/alerts', {
    revalidate: false,
    withCredentials: true,
  });
}

export async function createAlert(data: AlertCreateRequest): Promise<AlertOut> {
  return request<AlertOut>('/api/v1/alerts', {
    method: 'POST',
    body: JSON.stringify(data),
    revalidate: false,
    withCredentials: true,
  });
}

export async function deleteAlert(id: string): Promise<void> {
  return request<void>(`/api/v1/alerts/${id}`, {
    method: 'DELETE',
    revalidate: false,
    withCredentials: true,
  });
}

export async function getAlertTypes(): Promise<AlertTypesResponse> {
  return request<AlertTypesResponse>('/api/v1/alerts/types', { revalidate: 3600 });
}

// ---------- Auth ----------

export async function authLogin(username: string, password: string): Promise<MeResponse> {
  return request<MeResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    revalidate: false,
    withCredentials: true,
  });
}

export async function authLogout(): Promise<void> {
  return request<void>('/api/v1/auth/logout', {
    method: 'POST',
    revalidate: false,
    withCredentials: true,
  });
}

export async function authMe(): Promise<MeResponse> {
  return request<MeResponse>('/api/v1/auth/me', {
    revalidate: false,
    withCredentials: true,
  });
}

// ---------- Admin ----------

export async function adminListUsers(): Promise<MeResponse[]> {
  return request<MeResponse[]>('/api/v1/admin/users', {
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminListApiKeys(): Promise<ApiKeyPublic[]> {
  return request<ApiKeyPublic[]>('/api/v1/admin/api-keys', {
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminCreateApiKey(
  data: ApiKeyCreateRequest
): Promise<ApiKeyCreateResponse> {
  return request<ApiKeyCreateResponse>('/api/v1/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminRevokeApiKey(id: string): Promise<ApiKeyPublic> {
  return request<ApiKeyPublic>(`/api/v1/admin/api-keys/${id}/revoke`, {
    method: 'POST',
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminAiAnalytics(): Promise<AIAnalyticsResponse> {
  return request<AIAnalyticsResponse>('/api/v1/admin/ai-analytics', {
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminListAuditLog(opts?: {
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (opts?.action) params.set('action', opts.action);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const q = params.toString();
  return request<AuditLogEntry[]>(
    `/api/v1/admin/audit-log${q ? `?${q}` : ''}`,
    { revalidate: false, withCredentials: true }
  );
}

export async function adminSeed(): Promise<{ status: string; areas?: number; snapshots?: number }> {
  return request('/api/v1/admin/seed', {
    method: 'POST',
    revalidate: false,
    withCredentials: true,
  });
}

// ---------- Supply layer: opportunities feed, brokers, deals, consultations ----------

function brokerAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? getBrokerToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getOpportunitiesFeed(opts?: {
  kind?: 'all' | 'signals' | 'deals';
  area?: string;
  strategy?: string;
  category?: string;
  min_score?: number;
  limit?: number;
  sort_by?: 'score' | 'yield' | 'appreciation';
}): Promise<OpportunityFeedResponse> {
  const params = new URLSearchParams();
  if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.area) params.set('area', opts.area);
  if (opts?.strategy) params.set('strategy', opts.strategy);
  if (opts?.category) params.set('category', opts.category);
  if (opts?.min_score != null) params.set('min_score', String(opts.min_score));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sort_by) params.set('sort_by', opts.sort_by);
  const q = params.toString();
  return request<OpportunityFeedResponse>(
    `/api/v1/opportunities${q ? `?${q}` : ''}`,
    { revalidate: 60 }
  );
}

export async function getDeal(id: string): Promise<Deal> {
  return request<Deal>(`/api/v1/opportunities/deals/${id}`, { revalidate: 60 });
}

export async function requestDealConsultation(
  id: string,
  payload: LeadCreate
): Promise<ConsultationRequestResponse> {
  return request<ConsultationRequestResponse>(
    `/api/v1/opportunities/deals/${id}/request-consultation`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      revalidate: false,
    }
  );
}

export async function requestConsultation(
  payload: LeadCreate
): Promise<ConsultationRequestResponse> {
  return request<ConsultationRequestResponse>('/api/v1/consultations/request', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

// ---- Public broker application ----

export async function applyAsBroker(
  payload: BrokerApplicationCreate
): Promise<BrokerApplication> {
  return request<BrokerApplication>('/api/v1/brokers/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

// ---- Broker self (Bearer token auth) ----

export async function brokerLogin(
  email: string,
  password: string
): Promise<BrokerLoginResponse> {
  return request<BrokerLoginResponse>('/api/v1/broker/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    revalidate: false,
  });
}

export async function brokerMe(): Promise<Broker> {
  return request<Broker>('/api/v1/broker/me', {
    revalidate: false,
    headers: brokerAuthHeaders(),
  });
}

export async function brokerListMyOpportunities(status?: string): Promise<Deal[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<Deal[]>(`/api/v1/broker/opportunities${q}`, {
    revalidate: false,
    headers: brokerAuthHeaders(),
  });
}

export async function brokerCreateOpportunity(payload: DealCreate): Promise<Deal> {
  return request<Deal>('/api/v1/broker/opportunities', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
    headers: brokerAuthHeaders(),
  });
}

export async function brokerUpdateOpportunity(
  id: string,
  payload: DealUpdate
): Promise<Deal> {
  return request<Deal>(`/api/v1/broker/opportunities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    revalidate: false,
    headers: brokerAuthHeaders(),
  });
}

export async function brokerListMyLeads(status?: string): Promise<InvestorLead[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<InvestorLead[]>(`/api/v1/broker/leads${q}`, {
    revalidate: false,
    headers: brokerAuthHeaders(),
  });
}

export async function brokerUpdateLead(
  id: string,
  payload: LeadUpdate
): Promise<InvestorLead> {
  return request<InvestorLead>(`/api/v1/broker/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    revalidate: false,
    headers: brokerAuthHeaders(),
  });
}

// ---- Admin (existing role-based auth via cookie) ----

export async function adminListBrokerApplications(
  status?: string
): Promise<BrokerApplication[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<BrokerApplication[]>(
    `/api/v1/admin/broker-applications${q}`,
    { revalidate: false, withCredentials: true }
  );
}

export async function adminApproveBrokerApplication(
  id: string,
  password?: string
): Promise<BrokerApproveResponse> {
  return request<BrokerApproveResponse>(
    `/api/v1/admin/broker-applications/${id}/approve`,
    {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
      revalidate: false,
      withCredentials: true,
    }
  );
}

export async function adminRejectBrokerApplication(
  id: string
): Promise<BrokerApplication> {
  return request<BrokerApplication>(
    `/api/v1/admin/broker-applications/${id}/reject`,
    {
      method: 'POST',
      revalidate: false,
      withCredentials: true,
    }
  );
}

export async function adminListBrokers(status?: string): Promise<Broker[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<Broker[]>(`/api/v1/admin/brokers${q}`, {
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminListPendingOpportunities(): Promise<Deal[]> {
  return request<Deal[]>('/api/v1/admin/opportunities/pending', {
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminApproveOpportunity(id: string): Promise<Deal> {
  return request<Deal>(`/api/v1/admin/opportunities/${id}/approve`, {
    method: 'POST',
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminRejectOpportunity(id: string): Promise<Deal> {
  return request<Deal>(`/api/v1/admin/opportunities/${id}/reject`, {
    method: 'POST',
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminListLeads(status?: string): Promise<InvestorLead[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<InvestorLead[]>(`/api/v1/admin/leads${q}`, {
    revalidate: false,
    withCredentials: true,
  });
}

export async function adminUpdateLead(
  id: string,
  payload: LeadUpdate
): Promise<InvestorLead> {
  return request<InvestorLead>(`/api/v1/admin/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    revalidate: false,
    withCredentials: true,
  });
}

// ---------- DLD data layer ----------

export async function getDldStats(): Promise<DldStatsResponse> {
  return request<DldStatsResponse>('/api/v1/dld/areas/stats', { revalidate: 3600 });
}

export async function getDldAreas(opts?: {
  q?: string;
  min_sales?: number;
  min_rents?: number;
  has_yield?: boolean;
  limit?: number;
  offset?: number;
}): Promise<DldAreaListResponse> {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.min_sales != null) params.set('min_sales', String(opts.min_sales));
  if (opts?.min_rents != null) params.set('min_rents', String(opts.min_rents));
  if (opts?.has_yield) params.set('has_yield', 'true');
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const q = params.toString();
  return request<DldAreaListResponse>(`/api/v1/dld/areas${q ? `?${q}` : ''}`, {
    revalidate: 600,
  });
}

export async function getDldArea(nameNorm: string): Promise<DldAreaDetailResponse> {
  return request<DldAreaDetailResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}`,
    { revalidate: 600 }
  );
}

export async function getDldAreaPriceHistory(
  nameNorm: string
): Promise<DldPriceHistoryResponse> {
  return request<DldPriceHistoryResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/price-history`,
    { revalidate: 3600 }
  );
}

export async function getDldAreaRentHistory(
  nameNorm: string
): Promise<DldRentHistoryResponse> {
  return request<DldRentHistoryResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/rent-history`,
    { revalidate: 3600 }
  );
}

export async function getMapAreas(): Promise<MapAreasResponse> {
  return request<MapAreasResponse>('/api/v1/dld/map/areas', {
    revalidate: 3600,
  });
}

export async function getMapBuildings(opts?: {
  area?: string;
}): Promise<MapBuildingsResponse> {
  const qs = opts?.area ? `?area=${encodeURIComponent(opts.area)}` : '';
  return request<MapBuildingsResponse>(`/api/v1/dld/map/buildings${qs}`, {
    revalidate: 3600,
  });
}

export async function getDldAreaCommunityProfile(
  nameNorm: string,
): Promise<AreaCommunityProfile> {
  return request<AreaCommunityProfile>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/community-profile`,
    { revalidate: 3600 },
  );
}

export async function getDldAreaBedroomPrices(
  nameNorm: string,
  opts?: { reg_type?: 'ready' | 'off_plan'; year?: number },
): Promise<AreaBedroomPricesResponse> {
  const q = new URLSearchParams();
  if (opts?.reg_type) q.set('reg_type', opts.reg_type);
  if (opts?.year) q.set('year', String(opts.year));
  const qs = q.toString();
  return request<AreaBedroomPricesResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/bedroom-prices${qs ? '?' + qs : ''}`,
    { revalidate: 3600 },
  );
}

export async function getDldAreaYieldHistory(
  nameNorm: string
): Promise<DldYieldHistoryResponse> {
  return request<DldYieldHistoryResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/yield-history`,
    { revalidate: 3600 }
  );
}

export async function getDldBuildingRentHistory(
  buildingId: string
): Promise<DldBuildingRentHistoryResponse> {
  return request<DldBuildingRentHistoryResponse>(
    `/api/v1/dld/buildings/${encodeURIComponent(buildingId)}/rent-history`,
    { revalidate: 3600 }
  );
}

export async function getDldAreaUpcomingAvailability(
  nameNorm: string,
  windowDays: 30 | 60 | 90 = 90
): Promise<UpcomingAvailabilityResponse> {
  return request<UpcomingAvailabilityResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/upcoming-availability?window_days=${windowDays}`,
    { revalidate: 3600 }
  );
}

export async function getDldBuildingLeaseExpiry(
  buildingId: string
): Promise<BuildingLeaseExpiryResponse> {
  return request<BuildingLeaseExpiryResponse>(
    `/api/v1/dld/buildings/${encodeURIComponent(buildingId)}/lease-expiry`,
    { revalidate: 3600 }
  );
}

export async function getDldAreaLifestyleScore(
  nameNorm: string
): Promise<AreaLifestyleScoreResponse> {
  return request<AreaLifestyleScoreResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/lifestyle-score`,
    { revalidate: 3600 }
  );
}

export async function getMarketOverview(): Promise<MarketOverviewResponse> {
  return request<MarketOverviewResponse>('/api/v1/dld/market-overview', {
    revalidate: 3600,
  });
}

/**
 * Single source of truth for area names across all dropdowns.
 * Default min_occurrences=5 hides ~26 noise areas (one-off DLD entries).
 * Source filter narrows to areas that appear in a specific dataset
 * (useful for /rent-check which only cares about areas with rent data).
 */
export async function getCanonicalAreas(opts?: {
  min_occurrences?: number;
  source?: 'transactions' | 'rents' | 'lands';
  only_with_coords?: boolean;
  only_with_polygon?: boolean;
}): Promise<CanonicalAreasResponse> {
  const params = new URLSearchParams();
  if (opts?.min_occurrences != null) {
    params.set('min_occurrences', String(opts.min_occurrences));
  }
  if (opts?.source) params.set('source', opts.source);
  if (opts?.only_with_coords) params.set('only_with_coords', 'true');
  if (opts?.only_with_polygon) params.set('only_with_polygon', 'true');
  const q = params.toString();
  return request<CanonicalAreasResponse>(
    `/api/v1/dld/canonical-areas${q ? `?${q}` : ''}`,
    { revalidate: 3600 }
  );
}

export async function getTopAppreciation(
  limit = 5,
  minYears = 5,
  window: '5y' | '10y' = '5y',
): Promise<TopAppreciationResponse> {
  return request<TopAppreciationResponse>(
    `/api/v1/dld/areas/top-appreciation?limit=${limit}&min_years=${minYears}&window=${window}`,
    { revalidate: 3600 }
  );
}

export async function calculateDldRoi(body: RoiCalcRequest): Promise<RoiCalcResponse> {
  return request<RoiCalcResponse>('/api/v1/dld/roi/calculate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getOpportunitiesFiltered(opts: {
  goal?: 'income' | 'growth' | 'balanced' | 'offplan';
  risk?: 'low' | 'medium' | 'high';
  budget_aed_max?: number;
  property_type?: 'apartment' | 'villa' | 'offplan';
  limit?: number;
}): Promise<OpportunitiesFilteredResponse> {
  const p = new URLSearchParams();
  if (opts.goal) p.set('goal', opts.goal);
  if (opts.risk) p.set('risk', opts.risk);
  if (opts.budget_aed_max) p.set('budget_aed_max', String(opts.budget_aed_max));
  if (opts.property_type) p.set('property_type', opts.property_type);
  if (opts.limit) p.set('limit', String(opts.limit));
  return request<OpportunitiesFilteredResponse>(
    `/api/v1/dld/opportunities-filtered?${p.toString()}`,
    { revalidate: 600 }
  );
}

export async function getSimilarAreas(
  areaName: string,
  limit = 3,
): Promise<SimilarAreasResponse> {
  return request<SimilarAreasResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(areaName)}/similar?limit=${limit}`,
    { revalidate: 3600 }
  );
}

export async function getMarketTiming(areaName: string): Promise<MarketTimingResponse> {
  return request<MarketTimingResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(areaName)}/market-timing`,
    { revalidate: 3600 }
  );
}

export async function getRentsByArea(opts: {
  direction: 'cheapest' | 'expensive';
  size?: 'studio' | '1br' | '2br' | '3br' | '4br';
  prop_sub_type?: string;
  limit?: number;
}): Promise<RentRankingResponse> {
  const p = new URLSearchParams({ direction: opts.direction });
  if (opts.size) p.set('size', opts.size);
  if (opts.prop_sub_type) p.set('prop_sub_type', opts.prop_sub_type);
  if (opts.limit) p.set('limit', String(opts.limit));
  return request<RentRankingResponse>(
    `/api/v1/dld/rents/by-area?${p.toString()}`,
    { revalidate: 3600 }
  );
}

export async function getDashboardData(): Promise<DashboardDataResponse> {
  // Aggregator endpoint — backend caches 1h in Redis. Client revalidates
  // the same TTL so SSR doesn't shoulder the full query on every request.
  return request<DashboardDataResponse>(
    '/api/v1/dld/dashboard-data',
    { revalidate: 3600 }
  );
}

export async function getDldBuildings(opts?: {
  area?: string;
  project?: string;
  master_project?: string;
  q?: string;
  prop_sub_type?: string;
  building_type?: 'tower' | 'complex' | 'villa_community' | 'under_construction';
  min_rents?: number;
  sort_by?: 'rent_count' | 'rent_per_sqft' | 'avg_rent' | 'occupancy';
  limit?: number;
  offset?: number;
}): Promise<DldBuildingsResponse> {
  const params = new URLSearchParams();
  if (opts?.area) params.set('area', opts.area);
  if (opts?.project) params.set('project', opts.project);
  if (opts?.master_project) params.set('master_project', opts.master_project);
  if (opts?.q) params.set('q', opts.q);
  if (opts?.prop_sub_type) params.set('prop_sub_type', opts.prop_sub_type);
  if (opts?.building_type) params.set('building_type', opts.building_type);
  if (opts?.min_rents != null) params.set('min_rents', String(opts.min_rents));
  if (opts?.sort_by) params.set('sort_by', opts.sort_by);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const q = params.toString();
  return request<DldBuildingsResponse>(
    `/api/v1/dld/buildings${q ? `?${q}` : ''}`,
    { revalidate: 600 }
  );
}

export async function getDldBuilding(id: string): Promise<DldBuildingDetailResponse> {
  return request<DldBuildingDetailResponse>(
    `/api/v1/dld/buildings/${encodeURIComponent(id)}`,
    { revalidate: 600 }
  );
}

export async function getDldBuildingsDerived(opts?: {
  area?: string;
  master_project?: string;
  category?: string;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<DldBuildingsResponse> {
  const params = new URLSearchParams();
  if (opts?.area) params.set('area', opts.area);
  if (opts?.master_project) params.set('master_project', opts.master_project);
  if (opts?.category) params.set('category', opts.category);
  if (opts?.q) params.set('q', opts.q);
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.page_size) params.set('page_size', String(opts.page_size));
  const qs = params.toString();
  return request<DldBuildingsResponse>(
    `/api/v1/dld/buildings-derived${qs ? `?${qs}` : ''}`,
    { revalidate: 600 }
  );
}

export async function getDldAreaCategoryBreakdown(
  nameNorm: string
): Promise<AreaCategoryBreakdownResponse> {
  return request<AreaCategoryBreakdownResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/category-breakdown`,
    { revalidate: 3600 }
  );
}

export async function getDldCommunities(opts?: {
  area?: string;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<DldCommunitiesResponse> {
  const params = new URLSearchParams();
  if (opts?.area) params.set('area', opts.area);
  if (opts?.q) params.set('q', opts.q);
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.page_size) params.set('page_size', String(opts.page_size));
  const qs = params.toString();
  return request<DldCommunitiesResponse>(
    `/api/v1/dld/communities${qs ? `?${qs}` : ''}`,
    { revalidate: 600 }
  );
}

export async function getDldDashboardPulse(): Promise<DashboardPulseResponse> {
  return request<DashboardPulseResponse>(
    '/api/v1/dld/dashboard-pulse',
    { revalidate: 600 }
  );
}

export async function getDldBuildingDerived(
  id: string
): Promise<DldBuildingDetailResponse> {
  return request<DldBuildingDetailResponse>(
    `/api/v1/dld/buildings-derived/${encodeURIComponent(id)}`,
    { revalidate: 600 }
  );
}

export async function getDldBuildingComparable(
  id: string,
  k = 5
): Promise<DldBuildingsComparableResponse> {
  return request<DldBuildingsComparableResponse>(
    `/api/v1/dld/buildings/${encodeURIComponent(id)}/comparable?k=${k}`,
    { revalidate: 600 }
  );
}

export async function getDldAreaTopBuildings(
  nameNorm: string,
  k = 10
): Promise<DldAreaTopBuildingsResponse> {
  return request<DldAreaTopBuildingsResponse>(
    `/api/v1/dld/areas/${encodeURIComponent(nameNorm)}/top-buildings?k=${k}`,
    { revalidate: 600 }
  );
}

export async function dldRentCheck(payload: RentCheckRequest): Promise<RentCheckResponse> {
  return request<RentCheckResponse>('/api/v1/dld/rent-check', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

export async function getDldBrokers(opts?: {
  q?: string;
  firm?: string;
  active?: boolean;
  gender?: 'male' | 'female';
  nationality?: string;
  limit?: number;
  offset?: number;
}): Promise<DldBrokersResponse> {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.firm) params.set('firm', opts.firm);
  if (opts?.active != null) params.set('active', String(opts.active));
  if (opts?.gender) params.set('gender', opts.gender);
  if (opts?.nationality) params.set('nationality', opts.nationality);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const q = params.toString();
  return request<DldBrokersResponse>(`/api/v1/dld/brokers${q ? `?${q}` : ''}`, {
    revalidate: 600,
  });
}

export async function getBrokerNationalityStats(): Promise<BrokerNationalityStats> {
  return request<BrokerNationalityStats>(
    '/api/v1/dld/broker-nationality-stats',
    { revalidate: 3600 }
  );
}

export async function getDldBroker(brokerNumber: string): Promise<DldBrokerItem> {
  return request<DldBrokerItem>(
    `/api/v1/dld/brokers/${encodeURIComponent(brokerNumber)}`,
    { revalidate: 600 }
  );
}

export async function getTopCompanies(limit = 10): Promise<TopCompaniesResponse> {
  return request<TopCompaniesResponse>(
    `/api/v1/dld/companies/top?limit=${limit}`,
    { revalidate: 3600 }
  );
}

export async function brokerMatch(req: BrokerMatchRequest): Promise<BrokerMatchResponse> {
  return request<BrokerMatchResponse>('/api/v1/dld/broker-match', {
    method: 'POST',
    body: JSON.stringify(req),
    revalidate: false,
  });
}

export async function createRentAlert(payload: RentAlertCreate): Promise<RentAlertOut> {
  return request<RentAlertOut>('/api/v1/dld/rent-alerts', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

export async function brokerConsultation(
  payload: BrokerConsultationRequestBody
): Promise<BrokerConsultationResponse> {
  return request<BrokerConsultationResponse>('/api/v1/dld/broker-consultation', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

// ---------- Developers ----------

export async function getDevelopers(opts?: {
  sort?: 'projects' | 'units' | 'score' | 'name';
  limit?: number;
}): Promise<DevelopersListResponse> {
  const p = new URLSearchParams();
  if (opts?.sort) p.set('sort', opts.sort);
  if (opts?.limit) p.set('limit', String(opts.limit));
  const qs = p.toString();
  return request<DevelopersListResponse>(
    `/api/v1/developers${qs ? `?${qs}` : ''}`,
    { revalidate: 300 }
  );
}

export async function getDeveloperDetail(slug: string): Promise<DeveloperDetail> {
  return request<DeveloperDetail>(
    `/api/v1/developers/${encodeURIComponent(slug)}`,
    { revalidate: 300 }
  );
}

// ---------- Off-plan ----------

export async function getOffplanProjects(opts?: {
  developer?: string;
  area_slug?: string;
  prop_sub_type?: string;
  min_units?: number;
  sort?: 'units' | 'newest' | 'oldest' | 'name';
  status?: 'active' | 'completed' | 'coming_soon' | 'all';
  include_completed?: boolean;
  limit?: number;
}): Promise<OffplanListResponse> {
  const p = new URLSearchParams();
  if (opts?.developer) p.set('developer', opts.developer);
  if (opts?.area_slug) p.set('area_slug', opts.area_slug);
  if (opts?.prop_sub_type) p.set('prop_sub_type', opts.prop_sub_type);
  if (opts?.min_units) p.set('min_units', String(opts.min_units));
  if (opts?.sort) p.set('sort', opts.sort);
  if (opts?.status) p.set('status', opts.status);
  if (opts?.include_completed) p.set('include_completed', 'true');
  if (opts?.limit) p.set('limit', String(opts.limit));
  const qs = p.toString();
  return request<OffplanListResponse>(
    `/api/v1/offplan/projects${qs ? `?${qs}` : ''}`,
    { revalidate: 300 }
  );
}

export async function getOffplanProject(slug: string): Promise<OffplanProjectDetail> {
  return request<OffplanProjectDetail>(
    `/api/v1/offplan/projects/${encodeURIComponent(slug)}`,
    { revalidate: 300 }
  );
}

export async function getOffplanComingSoon(limit = 40): Promise<OffplanListResponse> {
  return request<OffplanListResponse>(
    `/api/v1/offplan/coming-soon?limit=${limit}`,
    { revalidate: 600 }
  );
}

export async function registerOffplanInterest(
  payload: RegisterInterestRequest
): Promise<RegisterInterestResponse> {
  return request<RegisterInterestResponse>('/api/v1/offplan/register-interest', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

// ---------- Official DLD off-plan registry (Phase 3, TIER 1) ----------

export async function getOfficialProjects(opts?: {
  status?: string;
  area?: string;
  developer_number?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<OfficialProjectListResponse> {
  const p = new URLSearchParams();
  if (opts?.status) p.set('status', opts.status);
  if (opts?.area) p.set('area', opts.area);
  if (opts?.developer_number) p.set('developer_number', opts.developer_number);
  if (opts?.q) p.set('q', opts.q);
  if (opts?.limit) p.set('limit', String(opts.limit));
  if (opts?.offset) p.set('offset', String(opts.offset));
  const qs = p.toString();
  return request<OfficialProjectListResponse>(
    `/api/v1/dld/official/projects${qs ? `?${qs}` : ''}`,
    { revalidate: 300 }
  );
}

export async function getOfficialProject(projectNumber: string): Promise<OfficialProjectDetail> {
  return request<OfficialProjectDetail>(
    `/api/v1/dld/official/projects/${encodeURIComponent(projectNumber)}`,
    { revalidate: 300 }
  );
}

export async function getOfficialDevelopers(opts?: {
  sort?: 'projects' | 'value' | 'units' | 'name';
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<OfficialDeveloperListResponse> {
  const p = new URLSearchParams();
  if (opts?.sort) p.set('sort', opts.sort);
  if (opts?.q) p.set('q', opts.q);
  if (opts?.limit) p.set('limit', String(opts.limit));
  if (opts?.offset) p.set('offset', String(opts.offset));
  const qs = p.toString();
  return request<OfficialDeveloperListResponse>(
    `/api/v1/dld/official/developers${qs ? `?${qs}` : ''}`,
    { revalidate: 300 }
  );
}

export async function getOfficialDeveloper(developerNumber: string): Promise<OfficialDeveloperDetail> {
  return request<OfficialDeveloperDetail>(
    `/api/v1/dld/official/developers/${encodeURIComponent(developerNumber)}`,
    { revalidate: 300 }
  );
}

export { ApiError };
