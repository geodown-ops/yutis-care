import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths as PlatformPaths } from './generated/platform-api';
import type { paths as TenantPaths } from './generated/tenant-api';

/** A non-2xx response, with the API's `{ status, code, message }` body. Show `code`-based text to people, never `message`. */
export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly body?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Turns every non-2xx response into an ApiRequestError, so callers only handle success. */
const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined;
    const body = await response.clone().json().catch(() => null) as { code?: unknown; message?: unknown } | null;
    throw new ApiRequestError(
      response.status,
      typeof body?.code === 'string' ? body.code : 'http_error',
      typeof body?.message === 'string' ? body.message : response.statusText,
      body,
    );
  },
};

interface Options {
  /** Same origin in the apps (''); tests pass an absolute URL. */
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

/**
 * The tenant API. Frontends and the API share the tenant's domain ({tenant}.care.yutis.net/api), so requests carry
 * the HttpOnly session cookie without CORS. Paths and bodies are typed from apps/api/openapi.json.
 */
export function createTenantApi({ baseUrl = '', fetch: fetchImpl, headers }: Options = {}): TenantApi {
  const client = createClient<TenantPaths>({ baseUrl, credentials: 'same-origin', headers, ...(fetchImpl && { fetch: fetchImpl }) });
  client.use(throwOnError);
  return client;
}

/** The platform API (admin.care.yutis.net/platform-api), behind Identity-Aware Proxy in production. */
export function createPlatformApi({ baseUrl = '', fetch: fetchImpl, headers }: Options = {}): PlatformApi {
  const client = createClient<PlatformPaths>({ baseUrl, credentials: 'same-origin', headers, ...(fetchImpl && { fetch: fetchImpl }) });
  client.use(throwOnError);
  return client;
}

export type TenantApi = Client<TenantPaths>;
export type PlatformApi = Client<PlatformPaths>;

/**
 * The data of a call. Errors have already been thrown by the middleware, so this is the success body
 * (undefined for 204), e.g. `await data(api.GET('/api/cases'))`.
 */
export async function data<T>(call: Promise<{ data?: T }>): Promise<T> {
  return (await call).data as T;
}
