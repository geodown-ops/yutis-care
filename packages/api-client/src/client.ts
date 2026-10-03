import type { ApiError, Me, TenantInfo } from './types';

export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

/**
 * Same-origin client: frontends and the API share the tenant's domain, so requests carry the
 * HttpOnly session cookie without CORS.
 */
export function createApiClient(baseUrl = '/api', fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  async function get<T>(path: string): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as Partial<ApiError> | null;
      throw new ApiRequestError({ status: res.status, code: body?.code ?? 'http_error', message: body?.message ?? res.statusText });
    }
    return res.json() as Promise<T>;
  }
  return {
    tenant: () => get<TenantInfo>('/tenant'),
    me: () => get<Me>('/me'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
