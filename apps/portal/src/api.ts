/*
 * The tenant API on the same origin ({tenant}.care.yutis.com.tw/api; Vite proxies /api in development), and the
 * queries more than one screen reads. A flow's own calls stay in its page.
 */
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { ApiRequestError, createTenantApi, data, type Schemas, type TenantInfo } from '@yutis/api-client';

export const api = createTenantApi();

export const tenantQuery = queryOptions({
  queryKey: ['tenant'],
  queryFn: (): Promise<TenantInfo> => data(api.GET('/api/tenant')),
  staleTime: Infinity,
});

export const meQuery = queryOptions({ queryKey: ['me'], queryFn: () => data(api.GET('/api/me')) });

export const profileQuery = queryOptions({ queryKey: ['portal', 'profile'], queryFn: () => data(api.GET('/api/portal/profile')) });
export const tasksQuery = queryOptions({ queryKey: ['portal', 'tasks'], queryFn: () => data(api.GET('/api/portal/tasks')) });
/** One task, whether it is done, and its draft. Its own key prefix, so refreshing the list leaves an open flow alone. */
export const taskQuery = (kind: Schemas['TaskDetailDto']['kind'], id: string) => queryOptions({
  queryKey: ['portal', 'task', kind, id],
  queryFn: () => data(api.GET('/api/portal/tasks/{kind}/{id}', { params: { path: { kind, id } } })),
});
export const healthQuery = queryOptions({ queryKey: ['portal', 'health'], queryFn: () => data(api.GET('/api/portal/health')) });
export const consentsQuery = queryOptions({ queryKey: ['portal', 'consents'], queryFn: () => data(api.GET('/api/portal/consents')) });
export const acknowledgementQuery = (id: string) => queryOptions({
  queryKey: ['portal', 'acknowledgements', id],
  queryFn: () => data(api.GET('/api/portal/acknowledgements/{id}', { params: { path: { id } } })),
});

export const isApiError = (err: unknown, status: number): err is ApiRequestError => err instanceof ApiRequestError && err.status === status;
export const isUnauthorized = (err: unknown) => isApiError(err, 401);

/** 4xx answers will not change on a retry; network errors and 5xx get two more tries. */
export const retryServerErrors = (count: number, err: unknown) => !(err instanceof ApiRequestError && err.status < 500) && count < 2;

/** Forget everything from the last session (health data included); only the public tenant info stays. */
export function clearSession(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'tenant' });
}
