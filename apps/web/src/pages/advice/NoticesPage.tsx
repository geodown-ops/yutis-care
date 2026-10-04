import { Badge, Box, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CardNote } from '../states';
import { byNewest, isNew } from './advice';
import { noticesQuery } from './queries';

const when = (iso: string) => new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 部門主管: work-arrangement advice the occupational health staff sent me. Opening the page marks it all read. The API
 * names every notice's programme 「工作調整」 for managers (it must not hint at a pregnancy), so no programme is shown.
 */
export function NoticesPage() {
  const { data: notices } = useSuspenseQuery(noticesQuery);
  const rows = [...notices].sort(byNewest);
  const fresh = rows.filter(isNew).length;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>工作安排通知</Title>
        <Text c="dimmed" size="sm" mt={4}>職護或職醫請你協助安排的工作調整。這裡只有建議內容，不含面談紀錄或健康資料。</Text>
      </div>
      <Card>
        <Group justify="space-between" mb="md">
          <Text fw={600} size="lg">收到的通知</Text>
          {rows.length > 0 && <Text size="sm" c="dimmed">共 {rows.length} 則{fresh ? `，${fresh} 則是新的` : ''}</Text>}
        </Group>
        {rows.length === 0 ? <CardNote>目前沒有收到工作安排通知。</CardNote> : (
          <Stack gap="sm">
            {rows.map(n => (
              <Box key={n.id} p="md" style={{ background: isNew(n) ? 'var(--yutis-tile-lavender)' : 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
                <Group justify="space-between" gap="xs" mb={6} align="flex-start">
                  <Group gap="xs">
                    <Text fw={600}>{n.name}</Text>
                    <Text size="sm" c="dimmed" ff="monospace">{n.empNo}</Text>
                    {isNew(n) && <Badge size="sm" color="yutis" variant="filled" styles={{ root: { textTransform: 'none' } }}>新通知</Badge>}
                  </Group>
                  <Text size="xs" c="dimmed">{when(n.sentAt)}</Text>
                </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{n.advice}</Text>
              </Box>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
