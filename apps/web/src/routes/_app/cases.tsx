import { createFileRoute } from '@tanstack/react-router';
import { ApiRequestError } from '@yutis/api-client';
import { ALL_NAV_ITEMS, canAccess } from '../../nav';
import { CasesPage } from '../../pages/CasesPage';
import { casesQuery } from '../../queries';
import { meQuery } from '../../session';

export const Route = createFileRoute('/_app/cases')({
  // Roles without the menu item get the "no permission" page straight away instead of waiting on the API's 403.
  beforeLoad: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery);
    const item = ALL_NAV_ITEMS.find(i => i.path === '/cases');
    if (me.kind === 'staff' && item && !canAccess(me, item.access)) throw new ApiRequestError(403, 'forbidden', 'Not available for this role');
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(casesQuery),
  component: CasesPage,
});
