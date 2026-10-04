/* Names and fixed choices for pickers and filters (GET /api/org, GET /api/staff, GET /api/programs/options): no health data. */
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

/** Every active staff account with its work email, to fill in sign-off signers. */
export const staffQuery = queryOptions({
  queryKey: ['directory', 'staff', 'all'],
  queryFn: () => data(api.GET('/api/staff')),
  staleTime: 10 * 60_000,
});

/** The programme forms' fixed choices (work patterns, 工作區分, ergo measures, …); the same for every tenant. */
export const programmeOptionsQuery = queryOptions({
  queryKey: ['programs', 'options'],
  queryFn: () => data(api.GET('/api/programs/options')),
  staleTime: Infinity,
  gcTime: Infinity,
});
