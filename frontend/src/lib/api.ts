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
} from './types';

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
  tier?: 'strong' | 'moderate' | 'neutral' | 'overpriced';
  limit?: number;
}): Promise<{ count: number; results: OpportunityResult[] }> {
  const params = new URLSearchParams();
  if (opts?.tier) params.set('tier', opts.tier);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const q = params.toString();
  return request(`/api/v1/opportunities${q ? `?${q}` : ''}`, { revalidate: 300 });
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

export { ApiError };
