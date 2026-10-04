/* The 部門主管 inbox, its unread count, and who a notice can go to. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';

/** Reading the inbox marks every notice read, so it is not refetched behind the manager's back. */
export const noticesQuery = queryOptions({
  queryKey: ['notices'],
  queryFn: () => data(api.GET('/api/programs/notices')),
  // Long enough that mounting the page right after its loader does not fetch again and lose the 新通知 markers.
  staleTime: 30_000,
  refetchOnWindowFocus: false,
});

/** The menu badge: only a count, and reading it marks nothing read. */
export const unreadNoticesQuery = queryOptions({
  // Not under ['notices']: invalidating the badge must never refetch (and so mark read) the inbox.
  queryKey: ['notice-count'],
  queryFn: () => data(api.GET('/api/programs/notices/unread')),
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});

/** Active 部門主管 accounts with the departments (in my sites) they manage. Clinical staff only. */
export const managersQuery = queryOptions({
  queryKey: ['programs', 'managers'],
  queryFn: () => data(api.GET('/api/programs/managers')),
  staleTime: 5 * 60_000,
});
