/* Names for pickers and filters (GET /api/org, GET /api/staff): no contact details or health data. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';

/** 法人 → 廠區 → 部門, with my sites marked. */
export const orgQuery = queryOptions({ queryKey: ['directory', 'org'], queryFn: () => data(api.GET('/api/org')), staleTime: 10 * 60_000 });

/** Active 職醫 accounts, for the interviewing physician. */
export const doctorsQuery = queryOptions({
  queryKey: ['directory', 'staff', '職醫'],
  queryFn: () => data(api.GET('/api/staff', { params: { query: { roles: '職醫' } } })),
  staleTime: 10 * 60_000,
});
