import type {
  Area,
  ROICalculateRequest,
  ROICalculateResponse,
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

export async function getArea(id: string): Promise<Area> {
  return request<Area>(`/api/v1/areas/${id}`, { revalidate: 60 });
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

export { ApiError };
