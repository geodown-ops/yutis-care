import { createFileRoute } from '@tanstack/react-router';
import { ApiRequestError } from '@yutis/api-client';
import { ALL_NAV_ITEMS, canAccess } from '../../nav';
import { reportTypesQuery } from '../../pages/reports/queries';
import { isKind } from '../../pages/reports/report';
import { ReportsPage, type ReportsSearch } from '../../pages/reports/ReportsPage';
import { meQuery } from '../../session';

export const Route = createFileRoute('/_app/reports')({
  // Report and site live in the URL, so a report can be shared and survives a reload.
  validateSearch: (s: Record<string, unknown>): ReportsSearch => ({
    ...(isKind(s.kind) ? { kind: s.kind } : {}),
    ...(typeof s.type === 'string' && s.type ? { type: s.type } : {}),
    ...(typeof s.site === 'string' && s.site ? { site: s.site } : {}),
  }),
  // Roles without the menu item get the "no permission" page straight away instead of waiting on the API's 403.
  beforeLoad: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery);
    const item = ALL_NAV_ITEMS.find(i => i.path === '/reports');
    if (me.kind === 'staff' && item && !canAccess(me, item.access)) throw new ApiRequestError(403, 'forbidden', 'Not available for this role');
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(reportTypesQuery),
  component: function Reports() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return <ReportsPage search={search} onSearch={next => void navigate({ search: next, replace: true })} />;
  },
});
