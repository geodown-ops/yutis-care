import { Badge, Button, Card, Group, Skeleton, Table, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '@yutis/api-client';
import { CardNote, problemText } from '../states';
import { downloadExport, exportsQuery } from './queries';
import { EXPORT_STATE_LABEL, exportFileName, exportState, exportTitle, isPending, KIND_LABEL, pollInterval, SLOW_MINUTES, waitedMinutes, type ExportState } from './report';

const TONE: Record<ExportState, { bg: string; fg: string }> = {
  queued: { bg: 'var(--yutis-surface2)', fg: 'var(--yutis-muted)' },
  running: { bg: 'var(--yutis-info-weak)', fg: 'var(--yutis-info)' },
  ready: { bg: 'var(--yutis-ok-weak)', fg: 'var(--yutis-ok)' },
  expired: { bg: 'var(--yutis-surface2)', fg: 'var(--yutis-muted)' },
  failed: { bg: 'var(--yutis-bad-weak)', fg: 'var(--yutis-bad)' },
};
const isGone = (err: unknown) => err instanceof ApiRequestError && err.status === 410;
const dateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
const time = (iso: string) => new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** My exports: built by the background worker, then downloaded once through a short-lived link. */
export function ExportsCard() {
  const qc = useQueryClient();
  const list = useQuery({ ...exportsQuery, refetchInterval: q => pollInterval(q.state.data, new Date()) });
  const download = useMutation({
    mutationFn: downloadExport,
    // A download uses up the link and an expired file can no longer be fetched: refresh the states either way.
    onSettled: () => qc.invalidateQueries({ queryKey: exportsQuery.queryKey }),
  });
  const now = new Date();
  const slow = list.data?.some(e => isPending(e) && waitedMinutes(e, now) >= SLOW_MINUTES);

  return (
    <Card>
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="lg">我的匯出</Text>
        <Text size="xs" c="dimmed">檔案與畫面內容相同，附匯出人與時間浮水印；完成後 24 小時內可下載</Text>
      </Group>
      {list.isPending ? <Skeleton h={120} /> : list.isError ? <CardNote>{problemText(list.error)}</CardNote> : list.data.length === 0 ? (
        <CardNote>還沒有匯出過報表。在上方報表按「匯出 Excel」或「匯出 PDF」。</CardNote>
      ) : (
        <>
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>檔案</Table.Th><Table.Th>狀態</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.data.map(e => {
                  const state = exportState(e, now);
                  return (
                    <Table.Tr key={e.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{exportTitle(e)}</Text>
                        <Text size="xs" c="dimmed">{[KIND_LABEL[e.kind], e.format === 'xlsx' ? 'Excel' : 'PDF', `${dateTime(e.requestedAt)} 申請`].filter(Boolean).join(' · ')}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge styles={{ root: { background: TONE[state].bg, color: TONE[state].fg, textTransform: 'none', fontWeight: 600 } }}>{EXPORT_STATE_LABEL[state]}</Badge>
                        {state === 'ready' && e.expiresAt && <Text size="xs" c="dimmed" mt={2}>{time(e.expiresAt)} 前可下載</Text>}
                      </Table.Td>
                      <Table.Td ta="right">
                        {state === 'ready' && (
                          <Button size="xs" variant="default" loading={download.isPending && download.variables?.id === e.id} disabled={download.isPending} onClick={() => download.mutate({ id: e.id, fileName: exportFileName(e) })}>下載</Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {slow && <Text size="xs" c="dimmed" mt="xs">有匯出排隊較久，背景工作可能忙碌或暫停，請稍後再回來看。</Text>}
          {download.isError && <Text size="sm" c="var(--yutis-bad)" mt="xs" role="alert">{isGone(download.error) ? '這個檔案已過期或無法再下載，請重新匯出。' : problemText(download.error)}</Text>}
        </>
      )}
    </Card>
  );
}
