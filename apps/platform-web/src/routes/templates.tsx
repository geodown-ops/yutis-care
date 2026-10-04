import { Button, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { data } from '@yutis/api-client';
import { api, templatesQuery } from '../api';
import { ErrorAlert, Footnote, LoadError, PageLoader, ToneAlert, ToneBadge } from '../components';
import { TEMPLATE_KIND } from '../labels';
import { useCan } from '../permissions';

export const Route = createFileRoute('/templates')({ component: TemplatesPage });

function TemplatesPage() {
  const qc = useQueryClient();
  const { data: templates, error, refetch } = useQuery(templatesQuery);
  const sync = useMutation({
    mutationFn: () => data(api.POST('/platform-api/templates/sync')),
    onSuccess: result => qc.setQueryData(templatesQuery.queryKey, result),
  });
  // After a sync the list is its answer, which marks the kinds that got a new version.
  const rows = sync.data ?? templates;
  const published = sync.data?.filter(t => t.changed).length;
  const canPublish = useCan('templates:write');

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>預設範本</Title>
        {canPublish && <Button leftSection={<IconRefresh size={16} />} loading={sync.isPending} onClick={() => sync.mutate()}>更新為內建版本</Button>}
      </Group>
      <Text c="dimmed" size="sm" maw={720}>
        新租戶開通時會複製一份目前的預設範本，之後各租戶自行修改自己的副本。「更新為內建版本」會把內容有變動的範本發布為新版本，已開通的租戶不受影響。
      </Text>
      {sync.error && <ErrorAlert error={sync.error} />}
      {published != null && (
        <ToneAlert tone="ok">{published ? `已發布 ${published} 個範本的新版本，之後開通的租戶會使用新版本。` : '所有範本都已是最新的內建版本，沒有發布新版本。'}</ToneAlert>
      )}
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : !rows ? <PageLoader /> : (
        <Card>
          {rows.length === 0 ? (
            <ToneAlert tone="warn" title="還沒有預設範本">
              {canPublish ? '開通租戶前，請先按「更新為內建版本」建立預設範本。' : '開通租戶前，需要營運或工程角色先建立預設範本。'}
            </ToneAlert>
          ) : (
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="sm">
                <Table.Thead><Table.Tr><Table.Th>範本</Table.Th><Table.Th>目前版本</Table.Th><Table.Th aria-label="這次更新" /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {rows.map(t => (
                    <Table.Tr key={t.kind}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{TEMPLATE_KIND[t.kind].label}</Text>
                        <Text size="xs" c="dimmed">{TEMPLATE_KIND[t.kind].description}</Text>
                      </Table.Td>
                      <Table.Td ff="monospace">v{t.version}</Table.Td>
                      <Table.Td ta="right">{t.changed && <ToneBadge tone="ok">剛發布</ToneBadge>}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      )}
      <Footnote>範本內容由程式內建（分級規則、片語庫、簽核角色、問卷版本），在這裡只能發布，不能逐項編輯。</Footnote>
    </Stack>
  );
}
