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

async function request<T>(
  path: string,
  init?: RequestInit & { revalidate?: number | false }
): Promise<T> {
  const { revalidate, ...rest } = init ?? {};
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    ...rest,
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

  return (await res.json()) as T;
}

export async function getAreas(): Promise<Area[]> {
  return request<Area[]>('/api/v1/areas', { revalidate: 60 });
}

export async function getAreaStats(): Promise<AreaStats> {
  return request<AreaStats>('/api/v1/areas/stats', { revalidate: 300 });
}

export async function getArea(id: string): Promise<AreaDetail> {
  return request<AreaDetail>(`/api/v1/areas/${id}`, { revalidate: 60 });
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

export async function adminSeed(token: string): Promise<{ status: string; areas?: number; snapshots?: number; error?: string }> {
  return request('/api/v1/admin/seed', {
    method: 'POST',
    headers: { 'X-Admin-Token': token },
    revalidate: false,
  });
}

export { ApiError };
