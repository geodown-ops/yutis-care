import { ApiRequestError } from '@yutis/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { canAccess } from '../../nav';
import { meQuery } from '../../session';

/**
 * beforeLoad for the 租戶管理 pages: someone without the tenant-admin feature (who followed an old link) gets the
 * usual no-permission page at once, instead of waiting on refused API calls. The API enforces this anyway.
 */
export function adminOnly({ context: { queryClient } }: { context: { queryClient: QueryClient } }) {
  const me = queryClient.getQueryData(meQuery.queryKey);
  if (me?.kind === 'staff' && !canAccess(me, { feature: 'tenant-admin' })) {
    throw new ApiRequestError(403, 'forbidden', 'Tenant admin only');
  }
}
