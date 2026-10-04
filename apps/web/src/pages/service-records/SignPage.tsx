import { Anchor, Box, Button, Card, Center, Group, Loader, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiRequestError, data } from '@yutis/api-client';
import { YutisMark } from '@yutis/ui';
import { useState } from 'react';
import { api } from '../../api';
import { tenantQuery } from '../../session';
import { RecordSections } from './parts';
import { readSignDocument, signProblem } from './sign';

const dateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Public page behind the emailed one-time link (/sign/:token): the signer reads the 附表八 record and signs it once,
 * without an account. Opening does not use up the link; signing does.
 */
export function SignPage({ token }: { token: string }) {
  const tenant = useQuery(tenantQuery);
  const doc = useQuery({
    queryKey: ['sign', token],
    queryFn: () => data(api.GET('/api/sign/{token}', { params: { path: { token } } })),
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
  });
  const [comment, setComment] = useState('');
  const sign = useMutation({
    mutationFn: () => data(api.POST('/api/sign/{token}', { params: { path: { token } }, body: comment.trim() ? { comment: comment.trim() } : {} })),
  });
  const done = sign.data ?? (doc.data?.confirmedAt ? doc.data : undefined);
  const d = doc.data && readSignDocument(doc.data);

  return (
    <Box mih="100dvh" bg="var(--yutis-bg)" px="md" py="xl">
      <Stack maw={880} mx="auto" gap="lg">
        <Group gap={10} wrap="nowrap">
          <YutisMark height={28} />
          <Text fw={700} truncate>{tenant.data?.name ?? 'Yutis Care'}</Text>
        </Group>

        {doc.isPending ? <Center py={80}><Loader color="yutis.4" aria-label="載入中" /></Center>
          : doc.isError ? <Message title="無法開啟這個連結">{signProblem(doc.error)}</Message>
          : !d ? (
            <Message title={doc.data.title}>
              這是員工確認連結，請改到員工專區開啟：<Anchor href={`/me/sign/${encodeURIComponent(token)}`}>前往員工專區</Anchor>
            </Message>
          ) : (
            <>
              <Card padding="xl">
                <Stack gap={4} mb="lg">
                  <Title order={2} fz={24}>{doc.data.title}</Title>
                  <Text size="sm" c="dimmed">請確認以下紀錄內容。你以「{d.signer.role}」{d.signer.name} 的身分簽核。</Text>
                </Stack>
                <RecordSections serviceOn={d.serviceOn} siteName={d.site} content={d.record} />
              </Card>

              <Card padding="xl">
                {done ? (
                  <Group gap="sm" wrap="nowrap" align="flex-start" role="status">
                    <IconCircleCheck size={28} color="var(--yutis-ok)" style={{ flexShrink: 0 }} />
                    <div>
                      <Text fw={600}>已完成簽核</Text>
                      <Text size="sm" c="dimmed">{done.confirmedAt ? `簽核時間 ${dateTime(done.confirmedAt)}。` : ''}這個連結已失效，可以關閉這個頁面。</Text>
                      {done.comment && <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>意見：{done.comment}</Text>}
                    </div>
                  </Group>
                ) : (
                  <Stack gap="md">
                    <Textarea label="回覆意見（選填）" autosize minRows={2} maxRows={8} maxLength={1000} value={comment} onChange={e => setComment(e.currentTarget.value)} />
                    {sign.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{signProblem(sign.error)}</Text>}
                    <Group justify="space-between" gap="sm">
                      <Text size="xs" c="dimmed">簽核後連結立即失效，無法再修改意見。</Text>
                      <Button onClick={() => sign.mutate()} loading={sign.isPending} disabled={sign.error instanceof ApiRequestError && sign.error.status === 410}>確認並簽核</Button>
                    </Group>
                  </Stack>
                )}
              </Card>
            </>
          )}
      </Stack>
    </Box>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding="xl">
      <Title order={2} fz={22} mb="xs">{title}</Title>
      <Text size="sm">{children}</Text>
    </Card>
  );
}
