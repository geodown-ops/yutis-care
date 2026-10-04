import { ApiRequestError, data, type StaffMe, type TenantInfo } from '@yutis/api-client';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { api } from './api';

export const tenantQuery = queryOptions({
  queryKey: ['tenant'],
  queryFn: () => data(api.GET('/api/tenant')) as Promise<TenantInfo>,
  staleTime: Infinity,
});

/** Who is signed in. 401 when nobody is (or the session timed out); never retried. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => data(api.GET('/api/me')),
  staleTime: 5 * 60_000,
  retry: false,
});

export const isUnauthorized = (err: unknown) => err instanceof ApiRequestError && err.status === 401;

export const useTenant = () => useSuspenseQuery(tenantQuery).data;

/** The signed-in staff member. Only used under the `_app` layout, which sends everyone else away. */
export function useMe(): StaffMe {
  const me = useSuspenseQuery(meQuery).data;
  if (me.kind !== 'staff') throw new Error('Not a staff session');
  return me;
}

/** Ends the session and returns to the sign-in page with nothing cached. */
export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await data(api.POST('/api/auth/sign-out')).catch(() => undefined);
    qc.clear();
    await navigate({ to: '/login' });
  };
}
