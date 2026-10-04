import { Button, Card, Group, Stack, Text, Title, type ButtonProps } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** A Mantine button that is a real link (an <a> with the route's href), as in apps/web. */
const ButtonBase = forwardRef<HTMLAnchorElement, ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <Button component="a" ref={ref} {...props} />);
export const ButtonLink = createLink(ButtonBase);

/** A tab's page: title (and an action on the right), then cards. */
export function Page({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Stack gap="md" p="md" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
        <Title order={3}>{title}</Title>
        {action}
      </Group>
      {children}
    </Stack>
  );
}

/** A section heading inside a page. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="sm" component="section" mt="xs">
      <Text fw={700} size="lg">{title}</Text>
      {children}
    </Stack>
  );
}

/** A failed action, in the same tint as the sign-in page's problems. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <Text role="alert" size="sm" px="sm" py={8} style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--yutis-bad-weak)', color: 'var(--yutis-bad)' }}>
      {children}
    </Text>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card role="alert">
      <Group justify="space-between" wrap="nowrap">
        <Text c="dimmed">{t('errors.load')}</Text>
        <Button size="sm" variant="default" onClick={onRetry}>{t('errors.retry')}</Button>
      </Group>
    </Card>
  );
}
