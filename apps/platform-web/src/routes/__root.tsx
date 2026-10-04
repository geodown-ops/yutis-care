import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation, useRouter } from '@tanstack/react-router';
import { ConsoleShell, NavSection, SidebarIcon, sidebarLinkStyles } from '@yutis/ui';
import { menuLink, NavLinkRouter } from '../links';
import { isActivePath, NAV } from '../nav';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: PlatformLayout });

function PlatformLayout() {
  const { pathname } = useLocation();
  const { routesByPath } = useRouter();
  return (
    <ConsoleShell
      title="Yutis Care"
      subtitle="平台管理"
      // The platform API has no "who am I" endpoint yet, so the header cannot name the person or their role.
      user={{ name: '平台人員', role: 'Yutis 內部' }}
      nav={close => NAV.map(g => (
        <NavSection key={g.label} label={g.label}>
          {g.items.map(it => {
            const active = isActivePath(it.path, pathname);
            return <NavLinkRouter key={it.path} {...menuLink(it.path, routesByPath)} label={it.label} leftSection={<SidebarIcon icon={it.icon} active={active} />} active={active} onClick={close} aria-current={active ? 'page' : undefined} styles={sidebarLinkStyles(active)} />;
          })}
        </NavSection>
      ))}
    >
      <Outlet />
    </ConsoleShell>
  );
}
