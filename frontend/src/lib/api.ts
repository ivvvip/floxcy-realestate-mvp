import type {
  Area,
  AreaDetail,
  AreaStats,
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
  DldStatsResponse,
  DldBuildingsResponse,
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

export async function getArea(id: string): Promise<AreaDetail> {
  return request<AreaDetail>(`/api/v1/areas/${id}`, { revalidate: 60 });
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
  min_score?: number;
  limit?: number;
  sort_by?: 'score' | 'yield' | 'appreciation';
}): Promise<OpportunityFeedResponse> {
  const params = new URLSearchParams();
  if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.area) params.set('area', opts.area);
  if (opts?.strategy) params.set('strategy', opts.strategy);
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

export async function getDldBuildings(opts?: {
  area?: string;
  project?: string;
  min_rents?: number;
  limit?: number;
  offset?: number;
}): Promise<DldBuildingsResponse> {
  const params = new URLSearchParams();
  if (opts?.area) params.set('area', opts.area);
  if (opts?.project) params.set('project', opts.project);
  if (opts?.min_rents != null) params.set('min_rents', String(opts.min_rents));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const q = params.toString();
  return request<DldBuildingsResponse>(
    `/api/v1/dld/buildings${q ? `?${q}` : ''}`,
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
  limit?: number;
  offset?: number;
}): Promise<DldBrokersResponse> {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.firm) params.set('firm', opts.firm);
  if (opts?.active != null) params.set('active', String(opts.active));
  if (opts?.gender) params.set('gender', opts.gender);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const q = params.toString();
  return request<DldBrokersResponse>(`/api/v1/dld/brokers${q ? `?${q}` : ''}`, {
    revalidate: 600,
  });
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

export { ApiError };
