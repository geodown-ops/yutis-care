import { Badge, Select, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { STAFF_ROLES, type StaffRole } from '@yutis/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { ConsoleShell, NavSection, SidebarIcon, sidebarLinkStyles } from '@yutis/ui';
import { CASES } from '../demo';
import { NavLinkRouter, splat } from '../links';
import { isActivePath, navFor } from '../nav';
import { DEMO, meQuery, tenantQuery, useDemoRoleSwitch, useMe, useTenant } from '../session';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context: { queryClient } }) => Promise.all([queryClient.ensureQueryData(tenantQuery), queryClient.ensureQueryData(meQuery)]),
  component: RootLayout,
});

function RootLayout() {
  const tenant = useTenant();
  const me = useMe();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const switchRole = useDemoRoleSwitch();
  const unopened = CASES.filter(c => c.status === '未開單').length;
  const canSearch = navFor(me.role).some(g => g.items.some(i => i.path === '/employees'));

  return (
    <ConsoleShell
      product="Yutis Care"
      subtitle={tenant.name}
      user={{ name: me.name, role: me.role }}
      headerStart={canSearch && (
        <TextInput aria-label="以姓名或工號搜尋員工" placeholder="搜尋員工姓名或工號" leftSection={<IconSearch size={16} />} maw={320} visibleFrom="md"
          styles={{ input: { borderColor: 'transparent' } }}
          onKeyDown={e => { if (e.key === 'Enter') void navigate({ to: '/employees', search: { q: e.currentTarget.value || undefined } }); }} />
      )}
      headerEnd={DEMO && (
        <Select aria-label="示範：切換角色" size="sm" w={150} visibleFrom="sm" allowDeselect={false}
          styles={{ input: { borderColor: 'transparent' } }}
          data={STAFF_ROLES.map(r => ({ value: r, label: `示範：${r}` }))} value={me.role}
          onChange={v => { if (v) { switchRole(v as StaffRole); void navigate({ to: '/' }); } }} />
      )}
      nav={close => navFor(me.role).map(g => (
        <NavSection key={g.label} label={g.label}>
          {g.items.map(it => {
            const active = isActivePath(it.path, pathname);
            return (
              <NavLinkRouter key={it.path} {...splat(it.path)} label={it.label} leftSection={<SidebarIcon icon={it.icon} active={active} />} active={active} onClick={close}
                aria-current={active ? 'page' : undefined} styles={sidebarLinkStyles(active)}
                rightSection={it.path === '/' && unopened ? <Badge size="xs" color="red" variant="filled">{unopened}</Badge> : null} />
            );
          })}
        </NavSection>
      ))}
    >
      <Outlet />
    </ConsoleShell>
  );
}
