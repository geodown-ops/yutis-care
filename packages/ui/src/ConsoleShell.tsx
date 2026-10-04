import { AppShell, Avatar, Box, Burger, Group, Menu, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout } from '@tabler/icons-react';
import type { ComponentType, ReactNode } from 'react';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { YutisMark } from './YutisMark';

/**
 * Desktop console layout shared by the tenant admin and the platform admin: a light sidebar that blends
 * into the page, with the current item as an ink pill; header with search and user; cards on the grey page.
 */
export function ConsoleShell({ title, subtitle, user, onSignOut, nav, navFooter, headerStart, headerEnd, children }: {
  /** Shown next to the YUTIS mark: the tenant's name in the tenant admin, the product name elsewhere. */
  title: string;
  subtitle?: string;
  user: { name: string; role: string };
  /** Adds a menu with 登出 under the user. Omitted where sign-in is outside the app (platform admin behind IAP). */
  onSignOut?: () => void;
  /** Sidebar content; receives `close` so a nav click can close the drawer on phones. */
  nav: (close: () => void) => ReactNode;
  navFooter?: ReactNode;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  const [opened, { toggle, close }] = useDisclosure();
  return (
    <AppShell
      layout="alt"
      header={{ height: 68 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
      styles={{
        navbar: { background: 'var(--yutis-nav)', borderRight: 0 },
        header: { background: 'var(--yutis-bg)', borderBottom: 0 },
        main: { background: 'var(--yutis-bg)' },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="lg" gap="sm" wrap="nowrap">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="開啟選單" />
          <Box style={{ flex: 1, minWidth: 0 }}>{headerStart}</Box>
          {headerEnd}
          <ColorSchemeToggle />
          {onSignOut ? (
            <Menu position="bottom-end" width={180}>
              <Menu.Target>
                <UnstyledButton aria-label={`${user.name}的帳號選單`} style={{ borderRadius: 999 }}><UserChip user={user} /></UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={onSignOut}>登出</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : <UserChip user={user} />}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar px="md" pt="lg" pb="md">
        <AppShell.Section mb="lg">
          <Group gap={10} wrap="nowrap" px={6}>
            <YutisMark height={30} />
            <div style={{ minWidth: 0 }}>
              <Text fw={700} c="var(--mantine-color-text)" lh={1.25} lineClamp={2} title={title}>{title}</Text>
              {subtitle && <Text size="xs" c="var(--yutis-nav-muted)" truncate>{subtitle}</Text>}
            </div>
          </Group>
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea} type="scroll">
          <Stack gap="md">{nav(close)}</Stack>
        </AppShell.Section>
        {navFooter && <AppShell.Section pt="sm">{navFooter}</AppShell.Section>}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}

function UserChip({ user }: { user: { name: string; role: string } }) {
  return (
    <Group gap={10} wrap="nowrap">
      <Avatar color="yutis" radius="xl" size={36}>{user.name[0]}</Avatar>
      <Box visibleFrom="md">
        <Text size="sm" fw={600} lh={1.2}>{user.name}</Text>
        <Text size="xs" c="dimmed">{user.role}</Text>
      </Box>
    </Group>
  );
}

/** A labelled group of sidebar links. */
export function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={500} c="var(--yutis-nav-muted)" px={6}>{label}</Text>
      {children}
    </Stack>
  );
}

/** Menu icon in a small circle, as in the reference sidebar. */
export function SidebarIcon({ icon: I, active }: { icon: ComponentType<{ size?: number; stroke?: number }>; active: boolean }) {
  return (
    <Box aria-hidden w={28} h={28} style={{
      borderRadius: '50%', display: 'grid', placeItems: 'center',
      background: active ? 'color-mix(in srgb, var(--yutis-nav-strong) 16%, transparent)' : 'var(--yutis-nav-icon)',
    }}>
      <I size={16} stroke={1.75} />
    </Box>
  );
}

/** Styles for a Mantine NavLink on the sidebar: the current item is a filled pill. */
export const sidebarLinkStyles = (active: boolean) => ({
  root: {
    borderRadius: 999,
    padding: '6px 10px 6px 6px',
    color: active ? 'var(--yutis-nav-strong)' : 'var(--yutis-nav-fg)',
    background: active ? 'var(--yutis-nav-active)' : undefined,
    fontWeight: active ? 600 : 500,
  },
});
