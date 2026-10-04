import { Badge, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router';
import { ConsoleShell, NavSection, SidebarIcon, sidebarLinkStyles } from '@yutis/ui';
import { NavLinkRouter, splat } from '../links';
import { unreadNoticesQuery } from '../pages/advice/queries';
import { canAccess, isActivePath, navFor } from '../nav';
import { casesQuery } from '../queries';
import { isUnauthorized, meQuery, tenantQuery, useMe, useSignOut, useTenant } from '../session';

/** The signed-in back office: anyone without a staff session goes to /login, employees to their portal. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const me = await queryClient.ensureQueryData(meQuery).catch((err: unknown) => {
      if (isUnauthorized(err)) throw redirect({ to: '/login', search: { redirect: location.href } });
      throw err;
    });
    if (me.kind === 'employee') throw redirect({ href: '/me/', reloadDocument: true });
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(tenantQuery),
  component: AppLayout,
});

function AppLayout() {
  const tenant = useTenant();
  const me = useMe();
  const signOut = useSignOut();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const nav = navFor(me);
  const seesCases = canAccess(me, { feature: 'cases', data: 'health' });
  const cases = useQuery({ ...casesQuery, enabled: seesCases });
  const unopened = cases.data?.filter(c => c.status === '未開單').length ?? 0;
  // 部門主管: unread 工作安排通知 (a count only; it marks nothing read).
  const unread = useQuery({ ...unreadNoticesQuery, enabled: me.role === '部門主管' }).data?.unread ?? 0;
  const badge = (path: string) =>
    path === '/' && unopened ? <Badge size="xs" color="red" variant="filled" aria-label={`${unopened} 件未開單`}>{unopened}</Badge>
      : path === '/programs/notices' && unread ? <Badge size="xs" color="red" variant="filled" aria-label={`${unread} 則未讀通知`}>{unread}</Badge>
        : null;
  // The employee list has its own search box.
  const canSearch = canAccess(me, { feature: 'employees', data: 'identity' }) && !isActivePath('/employees', pathname);

  return (
    <ConsoleShell
      title={tenant.name}
      user={{ name: me.name, role: me.role }}
      onSignOut={() => void signOut()}
      headerStart={canSearch && (
        <TextInput aria-label="以姓名或工號搜尋員工" placeholder="搜尋員工姓名或工號" leftSection={<IconSearch size={16} />} maw={320} visibleFrom="md"
          styles={{ input: { borderColor: 'transparent' } }}
          onKeyDown={e => { if (e.key === 'Enter') void navigate({ to: '/employees', search: { q: e.currentTarget.value || undefined } }); }} />
      )}
      nav={close => nav.map(g => (
        <NavSection key={g.label} label={g.label}>
          {g.items.map(it => {
            const active = isActivePath(it.path, pathname);
            return (
              <NavLinkRouter key={it.path} {...splat(it.path)} label={it.label} leftSection={<SidebarIcon icon={it.icon} active={active} />} active={active} onClick={close}
                aria-current={active ? 'page' : undefined} styles={sidebarLinkStyles(active)}
                rightSection={badge(it.path)} />
            );
          })}
        </NavSection>
      ))}
    >
      <Outlet />
    </ConsoleShell>
  );
}
