/* The 部門主管 inbox. Reading it marks every notice read, so it is not refetched behind the manager's back. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';

export const noticesQuery = queryOptions({
  queryKey: ['notices'],
  queryFn: () => data(api.GET('/api/programs/notices')),
  // Long enough that mounting the page right after its loader does not fetch again and lose the 新通知 markers.
  staleTime: 30_000,
  refetchOnWindowFocus: false,
});
