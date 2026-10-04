/* Small pieces the tenant admin screens share. */
import { Alert, Badge, Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { adminProblem } from './problems';

export function AdminTitle({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" gap="sm">
      <Stack gap={4} style={{ flex: '1 1 320px' }}>
        <Title order={2}>{title}</Title>
        {description && <Text c="dimmed" size="sm" maw={720}>{description}</Text>}
      </Stack>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

/** A status pill in the token colours (as EmployeeStatus does). */
export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const style = tone === 'muted'
    ? { background: 'var(--yutis-surface2)', color: 'var(--yutis-muted)' }
    : { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})` };
  return <Badge styles={{ root: { ...style, textTransform: 'none', fontWeight: 600 } }}>{children}</Badge>;
}

/** A refused save or delete, in plain words. */
export function ErrorNote({ error, overrides }: { error: unknown; overrides?: Record<string, string> }) {
  if (!error) return null;
  return <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} p="sm">{adminProblem(error, overrides)}</Alert>;
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />} p="sm" styles={{ message: { color: 'var(--yutis-fg)' } }}>{children}</Alert>;
}

/** Asks before something that cannot be undone. Stays open with the reason when the API refuses. */
export function ConfirmModal({ opened, title, children, confirmLabel, danger, busy, error, errorOverrides, onConfirm, onClose }: {
  opened: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; error?: unknown;
  errorOverrides?: Record<string, string>; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text size="sm">{children}</Text>
        <ErrorNote error={error} overrides={errorOverrides} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button color={danger ? 'red' : undefined} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Buttons at the bottom of a form modal. */
export function FormActions({ busy, onCancel, submitLabel = '儲存', disabled }: { busy?: boolean; onCancel: () => void; submitLabel?: string; disabled?: boolean }) {
  return (
    <Group justify="flex-end" gap="sm" mt="xs">
      <Button variant="default" onClick={onCancel}>取消</Button>
      <Button type="submit" loading={busy} disabled={disabled}>{submitLabel}</Button>
    </Group>
  );
}
