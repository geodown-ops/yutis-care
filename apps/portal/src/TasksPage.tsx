import { Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DEMO_ME, DEMO_TENANT_NAME, MY_TASKS } from './demo';
import { LanguageSelect } from './LanguageSelect';

const ButtonLink = createLink(Button<'a'>);

export function TasksPage() {
  const { t } = useTranslation();
  const open = MY_TASKS.filter(x => !x.done);
  return (
    <>
      <Box bg="var(--mantine-primary-color-filled)" c="var(--mantine-primary-color-contrast)" px="md" pb={44}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text size="xs" style={{ opacity: 0.85 }}>{DEMO_TENANT_NAME} · {t('tasks.service')}</Text>
          <LanguageSelect />
        </Group>
        <Text fz={20} fw={700} mt={4}>{t('tasks.greeting', { name: DEMO_ME.givenName, count: open.length })}</Text>
      </Box>
      <Stack gap="sm" px="md" mt={-28}>
        {MY_TASKS.map(task => (
          <Card key={task.id} padding="md">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={600}>{task.title}</Text>
                <Text size="sm" c="dimmed">{task.detail}</Text>
              </div>
              {task.done
                ? <Button variant="light" color="gray" radius="xl" size="sm" disabled>{t('tasks.done')}</Button>
                : task.kind === 'nmq'
                  ? <ButtonLink to="/tasks/nmq" radius="xl" size="sm">{t('tasks.start')}</ButtonLink>
                  : <Button radius="xl" size="sm" variant="light">{t('tasks.view')}</Button>}
            </Group>
          </Card>
        ))}
        <Text size="xs" c="dimmed" px={4}>{t('tasks.privacy')}</Text>
      </Stack>
    </>
  );
}
