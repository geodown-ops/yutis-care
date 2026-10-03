import { Box, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconChecklist, IconHeartbeat, IconUser } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import { createLink, createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router';
import { forwardRef, type AnchorHTMLAttributes, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: PortalLayout });

const TabBase = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { on: boolean }>(({ on, ...props }, ref) => (
  <UnstyledButton component="a" ref={ref} {...props} py={8} mih={56} aria-current={on ? 'page' : undefined}
    c={on ? 'var(--mantine-primary-color-filled)' : 'dimmed'} style={{ display: 'block' }} />
));
const TabLink = createLink(TabBase);

const TABS = [
  { to: '/', key: 'tasks', Icon: IconChecklist },
  { to: '/health', key: 'health', Icon: IconHeartbeat },
  { to: '/report', key: 'report', Icon: IconAlertTriangle },
  { to: '/account', key: 'account', Icon: IconUser },
] as const satisfies readonly { to: string; key: string; Icon: ComponentType<{ size?: number; stroke?: number }> }[];

/** Mobile-first shell: a 480px column with a bottom tab bar. Questionnaires and confirmations hide the tab bar. */
function PortalLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const inFlow = pathname.startsWith('/tasks/');

  return (
    <Box mih="100dvh" bg="var(--yutis-bg)">
      <Box maw={480} mx="auto" mih="100dvh" pb={inFlow ? 0 : 72}>
        <Outlet />
      </Box>
      {!inFlow && (
        <Box component="nav" aria-label={t('tabs.tasks')} style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--yutis-surface)', borderTop: '1px solid var(--yutis-line)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          <Group maw={480} mx="auto" grow gap={0}>
            {TABS.map(({ to, key, Icon }) => {
              const on = to === '/' ? pathname === '/' : pathname.startsWith(to);
              return (
                <TabLink key={to} to={to} on={on}>
                  <Stack gap={2} align="center">
                    <Icon size={22} stroke={on ? 2.2 : 1.6} />
                    <Text size="xs" fw={on ? 700 : 500}>{t(`tabs.${key}`)}</Text>
                  </Stack>
                </TabLink>
              );
            })}
          </Group>
        </Box>
      )}
    </Box>
  );
}
