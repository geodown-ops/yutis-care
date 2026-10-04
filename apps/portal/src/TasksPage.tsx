import { Box, Card, EmptyState, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconChecks } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { YutisMark } from '@yutis/ui';
import { useTranslation } from 'react-i18next';
import { profileQuery, tasksQuery, tenantQuery } from './api';
import { formatDate } from './dates';
import { LanguageSelect } from './LanguageSelect';
import { ButtonLink, LoadError } from './Page';
import { TASK_MINUTES, taskLink, taskTitle } from './tasks';

/** 待辦: what the API says is open for this employee, each opening its own flow. */
export function TasksPage({ name }: { name: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const tenant = useQuery(tenantQuery);
  const profile = useQuery(profileQuery);
  const tasks = useQuery(tasksQuery);
  const open = tasks.data ?? [];

  return (
    <>
      <Box bg="var(--yutis-brand)" c="var(--yutis-brand-fg)" px="md" pb={44}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <YutisMark height={20} style={{ color: 'var(--yutis-brand-fg)', flexShrink: 0 }} />
            <Text size="xs" fw={500} truncate>{tenant.data ? `${tenant.data.name} · ${t('tasks.service')}` : t('tasks.service')}</Text>
          </Group>
          <LanguageSelect />
        </Group>
        <Text fz={22} fw={600} mt={4} lh={1.35}>
          {tasks.isSuccess ? t('tasks.greeting', { name: profile.data?.name ?? name, count: open.length }) : profile.data?.name ?? name}
        </Text>
      </Box>
      <Stack gap="sm" px="md" mt={-28}>
        {tasks.isPending && [0, 1].map(i => <Card key={i} padding="md"><Skeleton h={18} w="60%" /><Skeleton h={14} w="40%" mt={8} /></Card>)}
        {tasks.isError && <LoadError onRetry={() => void tasks.refetch()} />}
        {tasks.isSuccess && open.length === 0 && (
          <Card padding="xl">
            <EmptyState icon={<IconChecks size={28} />} variant="light" color="yutis" title={t('tasks.emptyTitle')} description={t('tasks.empty')} />
          </Card>
        )}
        {open.map(task => {
          const minutes = TASK_MINUTES[task.kind];
          const detail = [task.dueOn && t('tasks.due', { date: formatDate(task.dueOn, lang, { year: false }) }), minutes && t('tasks.minutes', { count: minutes })].filter(Boolean).join(' · ');
          return (
            <Card key={`${task.kind}:${task.id}`} padding="md">
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} lh={1.4}>{taskTitle(task, lang, k => t(`tasks.kinds.${k}`))}</Text>
                  {detail && <Text size="sm" c="dimmed">{detail}</Text>}
                </div>
                <ButtonLink {...taskLink(task)} size="sm" style={{ flexShrink: 0 }} variant={task.kind === 'acknowledgement' ? 'default' : 'filled'}>
                  {t(task.kind === 'acknowledgement' ? 'tasks.view' : 'tasks.start')}
                </ButtonLink>
              </Group>
            </Card>
          );
        })}
        <Text size="xs" c="dimmed" px={4}>{t('tasks.privacy')}</Text>
      </Stack>
    </>
  );
}
