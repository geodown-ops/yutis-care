import { createFileRoute } from '@tanstack/react-router';
import { ALL_NAV_ITEMS, canAccess, type Access } from '../../nav';
import { NoticesPage } from '../../pages/advice/NoticesPage';
import { noticesQuery, unreadNoticesQuery } from '../../pages/advice/queries';
import { NoProgrammeAccess } from '../../pages/programs/ErgoPage';
import { meQuery, useMe } from '../../session';

const ACCESS: Access | undefined = ALL_NAV_ITEMS.find(i => i.path === '/programs/notices')?.access;

export const Route = createFileRoute('/_app/programs/notices')({
  // Reading the inbox marks it read: fetch afresh on every visit (so a notice behind the menu badge shows up), never
  // on hover-preload. The menu badge then recounts. Only 部門主管 have an inbox; nobody else asks the API.
  loader: async ({ context: { queryClient }, preload }) => {
    if (preload) return;
    const me = await queryClient.ensureQueryData(meQuery);
    if (me.kind !== 'staff' || (ACCESS && !canAccess(me, ACCESS))) return;
    await queryClient.fetchQuery({ ...noticesQuery, staleTime: 0 });
    void queryClient.invalidateQueries({ queryKey: unreadNoticesQuery.queryKey });
  },
  component: function Notices() {
    const me = useMe();
    if (ACCESS && !canAccess(me, ACCESS)) {
      return <NoProgrammeAccess title="工作安排通知">這裡是部門主管收到的工作安排通知，只有部門主管可以查看。</NoProgrammeAccess>;
    }
    return <NoticesPage />;
  },
});
