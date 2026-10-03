import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router';
import { ConsoleShell, NavSection, sidebarLinkStyles } from '@yutis/ui';
import { NavLinkRouter, splat } from '../links';
import { isActivePath, NAV } from '../nav';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: PlatformLayout });

function PlatformLayout() {
  const { pathname } = useLocation();
  return (
    <ConsoleShell
      product="Yutis Care"
      subtitle="平台管理"
      user={{ name: '周子航', role: '營運' }}
      nav={close => NAV.map(g => (
        <NavSection key={g.label} label={g.label}>
          {g.items.map(it => {
            const active = isActivePath(it.path, pathname);
            return <NavLinkRouter key={it.path} {...splat(it.path)} label={it.label} active={active} onClick={close} aria-current={active ? 'page' : undefined} styles={sidebarLinkStyles(active)} />;
          })}
        </NavSection>
      ))}
    >
      <Outlet />
    </ConsoleShell>
  );
}
