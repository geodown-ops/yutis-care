/*
 * The frame every task flow shares (questionnaires and confirmations under /tasks, where the tab bar is hidden):
 * a way out, the title and progress on top, one question in the middle, the buttons at the bottom.
 */
import { ActionIcon, Box, Card, Group, Progress, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconCircleCheck, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { createLink } from '@tanstack/react-router';
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError, tasksQuery } from './api';
import { LanguageSelect } from './LanguageSelect';
import { ButtonLink, ErrorNote, LoadError } from './Page';
import type { TaskKind } from './tasks';

const CloseBase = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => (
  <ActionIcon component="a" ref={ref} {...props} variant="subtle" color="gray" size="lg" ml={-8} />
));
const CloseLink = createLink(CloseBase);

export function FlowFrame({ title, step, total, footer, error, exit = true, children }: {
  title: string;
  /** 0-based; progress is shown when `total` is set. */
  step?: number;
  total?: number;
  footer?: ReactNode;
  /** Shown above the buttons, e.g. a failed submit. */
  error?: string | null;
  /** The close button back to 待辦; off where the person may not be signed in (emailed links). */
  exit?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap={0} mih="100dvh">
      <Box bg="var(--yutis-surface)" px="md" pb="sm" style={{ borderBottom: '1px solid var(--yutis-line)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
            {exit && <CloseLink to="/" aria-label={t('flow.exit')}><IconX size={20} /></CloseLink>}
            <Text fw={700} lineClamp={2} lh={1.3}>{title}</Text>
          </Group>
          <LanguageSelect />
        </Group>
        {total != null && step != null && (
          <Group gap="sm" wrap="nowrap" mt={8}>
            <Progress value={((step + 1) / total) * 100} size="sm" radius="xl" style={{ flex: 1 }} aria-label={t('flow.progress')} />
            <Text size="sm" c="dimmed">{step + 1} / {total}</Text>
          </Group>
        )}
      </Box>

      <Stack gap="lg" p="md" style={{ flex: 1 }}>{children}</Stack>

      {(footer || error) && (
        <Stack gap="sm" p="md" style={{ position: 'sticky', bottom: 0, background: 'var(--yutis-bg)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          {error && <ErrorNote>{error}</ErrorNote>}
          {footer && <Group grow>{footer}</Group>}
        </Stack>
      )}
    </Stack>
  );
}

/** One answer out of a few worded options, as full-width targets (the NMQ grid's style, for longer labels). */
export function ChoiceList({ label, options, value, onChange }: { label: string; options: string[]; value: number | null; onChange: (i: number) => void }) {
  return (
    <Stack gap={8} role="radiogroup" aria-label={label}>
      {options.map((option, i) => {
        const on = value === i;
        return (
          <UnstyledButton key={i} role="radio" aria-checked={on} onClick={() => onChange(i)} px="md" py={12} mih={52} style={{
            borderRadius: 'var(--mantine-radius-md)', border: `1px solid ${on ? 'var(--mantine-primary-color-filled)' : 'var(--yutis-line)'}`,
            background: on ? 'var(--mantine-primary-color-filled)' : 'var(--yutis-surface)', color: on ? 'var(--mantine-primary-color-contrast)' : undefined,
          }}>
            <Text fw={on ? 700 : 500}>{option}</Text>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}

/** The end of a flow (sent, confirmed) or why it cannot start (not found, already sent), with the way back. */
export function FlowMessage({ title, message, done = false, exit = true }: { title: string; message: string; done?: boolean; exit?: boolean }) {
  const { t } = useTranslation();
  return (
    <Stack p="md" gap="md" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}>
      <Title order={3}>{title}</Title>
      <Card>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {done && <IconCircleCheck size={24} color="var(--yutis-ok)" style={{ flexShrink: 0 }} aria-hidden />}
          <div>
            <Text>{message}</Text>
            {done && <Text size="sm" c="dimmed" mt={4}>{t('flow.privacy')}</Text>}
          </div>
        </Group>
      </Card>
      {exit && <ButtonLink to="/" variant="light" size="md">{t('flow.back')}</ButtonLink>}
    </Stack>
  );
}

export function FlowLoading({ title, exit = true }: { title: string; exit?: boolean }) {
  return (
    <FlowFrame title={title} exit={exit}>
      <Skeleton h={28} w="70%" />
      <Skeleton h={180} />
    </FlowFrame>
  );
}

/** The open task this flow answers, from the task list (the API has no single-task read). */
export function useOpenTask(kind: TaskKind, id: string) {
  const q = useQuery(tasksQuery);
  return { ...q, task: q.data?.find(x => x.kind === kind && x.id === id) };
}

/** A flow's loading, error and not-found screens, or null when the task is there. */
export function taskGate(q: ReturnType<typeof useOpenTask>, title: string, missing: string): ReactNode {
  if (q.isPending) return <FlowLoading title={title} />;
  if (q.isError) return <FlowFrame title={title}><LoadError onRetry={() => void q.refetch()} /></FlowFrame>;
  if (!q.task) return <FlowMessage title={title} message={missing} />;
  return null;
}

/** 409 means someone (or another tab) already sent it; anything else may work on a retry. */
export const submitProblem = (err: unknown) => (isApiError(err, 409) ? 'already' : 'failed') as 'already' | 'failed';
