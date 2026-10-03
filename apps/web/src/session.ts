import { createApiClient, type Me, type StaffRole, type TenantInfo } from '@yutis/api-client';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { CURRENT_STAFF, TENANT } from './demo';

/** Until the tenant API exists the app runs on demo data. Set VITE_API=live to call /api. */
export const DEMO = import.meta.env.VITE_API !== 'live';

const api = createApiClient();

export const tenantQuery = queryOptions<TenantInfo>({
  queryKey: ['tenant'],
  queryFn: () => (DEMO ? Promise.resolve(TENANT) : api.tenant()),
  staleTime: Infinity,
});

export const meQuery = queryOptions<Me>({
  queryKey: ['me'],
  queryFn: () => (DEMO ? Promise.resolve(CURRENT_STAFF) : api.me()),
  staleTime: 5 * 60_000,
});

export const useTenant = () => useSuspenseQuery(tenantQuery).data;
export const useMe = () => useSuspenseQuery(meQuery).data;

/** Demo only: switch role to preview what each role's menu looks like. */
export function useDemoRoleSwitch() {
  const qc = useQueryClient();
  return (role: StaffRole) => qc.setQueryData<Me>(['me'], me => (me ? { ...me, role } : me));
}
