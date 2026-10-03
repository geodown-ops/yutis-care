import { AppShell, Avatar, Box, Burger, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { ReactNode } from 'react';
import { ColorSchemeToggle } from './ColorSchemeToggle';

/**
 * Desktop console layout shared by the tenant admin and the platform admin:
 * dark sidebar running full height, light header with search and user, grey work area.
 */
export function ConsoleShell({ product, subtitle, user, nav, navFooter, headerStart, headerEnd, children }: {
  product: string;
  subtitle: string;
  user: { name: string; role: string };
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
      header={{ height: 60 }}
      navbar={{ width: 232, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
      styles={{
        navbar: { background: 'var(--yutis-nav)', borderRight: 0 },
        header: { background: 'var(--yutis-bg)', borderBottom: 0 },
        main: { background: 'var(--yutis-bg)' },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="lg" gap="md" wrap="nowrap">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="開啟選單" />
          <Box style={{ flex: 1, minWidth: 0 }}>{headerStart}</Box>
          {headerEnd}
          <ColorSchemeToggle />
          <Group gap={8} wrap="nowrap">
            <Avatar color="yutis" radius="xl" size={32}>{user.name[0]}</Avatar>
            <Box visibleFrom="md">
              <Text size="sm" fw={600} lh={1.2}>{user.name}</Text>
              <Text size="xs" c="dimmed">{user.role}</Text>
            </Box>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section mb="md">
          <Group gap="sm" wrap="nowrap" px={6}>
            <Box w={30} h={30} style={{ borderRadius: 8, background: 'var(--mantine-primary-color-filled)', display: 'grid', placeItems: 'center', color: 'var(--mantine-primary-color-contrast)', fontWeight: 700, flexShrink: 0 }}>Y</Box>
            <div>
              <Text fw={700} c="var(--yutis-nav-strong)" size="sm" lh={1.2}>{product}</Text>
              <Text size="xs" c="var(--yutis-nav-muted)">{subtitle}</Text>
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

/** A labelled group of sidebar links. */
export function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" fw={600} c="var(--yutis-nav-muted)" px="xs" style={{ letterSpacing: '.08em' }}>{label}</Text>
      {children}
    </Stack>
  );
}

/** Styles for a Mantine NavLink placed on the dark sidebar. */
export const sidebarLinkStyles = (active: boolean) => ({
  root: {
    borderRadius: 8,
    color: active ? 'var(--yutis-nav-strong)' : 'var(--yutis-nav-fg)',
    background: active ? 'var(--yutis-nav-active)' : undefined,
    fontWeight: active ? 600 : 400,
  },
});
