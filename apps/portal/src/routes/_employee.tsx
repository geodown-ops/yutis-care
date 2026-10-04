import { Box, Button, Card, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconChecklist, IconHeartbeat, IconUser } from '@tabler/icons-react';
import { createFileRoute, createLink, Outlet, redirect, useLocation } from '@tanstack/react-router';
import type { StaffMe } from '@yutis/api-client';
import { YutisMark } from '@yutis/ui';
import { forwardRef, type AnchorHTMLAttributes, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { SignOutButton } from '../AccountPage';
import { isUnauthorized, meQuery } from '../api';
import { forgetUnsaved } from '../drafts';
import { applyProfileLang } from '../i18n';
import { LanguageSelect } from '../LanguageSelect';

/**
 * Every page but /login: needs a session. Not signed in → /login, then back here. A back-office account gets a
 * pointer to the back office instead, since the portal's API answers employees only.
 */
export const Route = createFileRoute('/_employee')({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    try {
      const me = await queryClient.ensureQueryData(meQuery);
      if (me.kind === 'employee') applyProfileLang(me.lang);
      // Unsaved questionnaire answers from before a lapsed session belong to whoever signed in then.
      forgetUnsaved(me.kind === 'employee' ? me.id : undefined);
      return { me };
    } catch (err) {
      if (isUnauthorized(err)) throw redirect({ to: '/login', search: { redirect: location.href } });
      throw err;
    }
  },
  component: EmployeeLayout,
});

function EmployeeLayout() {
  const { me } = Route.useRouteContext();
  return me.kind === 'employee' ? <PortalShell /> : <StaffNotice me={me} />;
}

const TabBase = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { on: boolean }>(({ on, ...props }, ref) => (
  <UnstyledButton component="a" ref={ref} {...props} py={8} mih={56} aria-current={on ? 'page' : undefined}
    c={on ? 'var(--mantine-color-text)' : 'dimmed'} style={{ display: 'block' }} />
));
const TabLink = createLink(TabBase);

const TABS = [
  { to: '/', key: 'tasks', Icon: IconChecklist },
  { to: '/health', key: 'health', Icon: IconHeartbeat },
  { to: '/report', key: 'report', Icon: IconAlertTriangle },
  { to: '/account', key: 'account', Icon: IconUser },
] as const satisfies readonly { to: string; key: string; Icon: ComponentType<{ size?: number; stroke?: number }> }[];

/** Mobile-first shell: a 480px column with a bottom tab bar. Questionnaires and confirmations hide the tab bar. */
function PortalShell() {
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

/** A back-office account opened /me: say where it is, link to the back office (outside this app's /me base) or sign out. */
function StaffNotice({ me }: { me: StaffMe }) {
  const { t } = useTranslation();
  return (
    <Box mih="100dvh" bg="var(--yutis-bg)" px="md" py="xl" style={{ display: 'grid', placeItems: 'center' }}>
      <Stack w="100%" maw={420} gap="lg">
        <Group justify="space-between" wrap="nowrap">
          <YutisMark height={28} />
          <LanguageSelect />
        </Group>
        <Card padding="xl">
          <Stack gap="md">
            <Title order={2} fz={24}>{t('staff.title')}</Title>
            <Text c="dimmed">{t('staff.body', { name: me.name })}</Text>
            <Button component="a" href="/" size="md">{t('staff.backOffice')}</Button>
            <SignOutButton label={t('staff.signOut')} />
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}
