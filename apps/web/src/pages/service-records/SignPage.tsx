import { Anchor, Badge, Box, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiRequestError, data } from '@yutis/api-client';
import { YutisMark } from '@yutis/ui';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { tenantQuery } from '../../session';
import { Field, RecordSections, SectionTitle } from './parts';
import { slashDate } from './records';
import { employeeSignPath, signProblem, signView, type ReviewSignContent, type SignDocument } from './sign';

const dateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Public page behind the emailed one-time link (/sign/:token): the signer reads the record (附表八, or a 不法侵害預防
 * 措施查核及評估) and signs it once, without an account. Opening does not use up the link; signing does. An employee's
 * confirmation link goes on to the employee portal.
 */
export function SignPage({ token }: { token: string }) {
  const tenant = useQuery(tenantQuery);
  const doc = useQuery({
    queryKey: ['sign', token],
    queryFn: () => data(api.GET('/api/sign/{token}', { params: { path: { token } } })),
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
  });
  const view = doc.data && signView(doc.data);
  const employee = view?.kind === 'employee';
  useEffect(() => { if (employee) window.location.replace(employeeSignPath(token)); }, [employee, token]);

  return (
    <Box mih="100dvh" bg="var(--yutis-bg)" px="md" py="xl">
      <Stack maw={880} mx="auto" gap="lg">
        <Group gap={10} wrap="nowrap">
          <YutisMark height={28} />
          <Text fw={700} truncate>{tenant.data?.name ?? 'Yutis Care'}</Text>
        </Group>

        {doc.isPending ? <Center py={80}><Loader color="yutis.4" aria-label="載入中" /></Center>
          : doc.isError ? <Message title="無法開啟這個連結">{signProblem(doc.error)}</Message>
          : view?.kind === 'employee' ? (
            <Message title={doc.data.title}>
              正在前往員工專區確認這份紀錄。如果沒有自動開啟，請<Anchor href={employeeSignPath(token)}>按這裡</Anchor>。
            </Message>
          )
          : view?.kind === 'missing' || !view ? <Message title={doc.data.title || '無法開啟這個連結'}>找不到這個連結要簽核的紀錄，可能已被刪除。請聯絡寄件的醫護人員。</Message>
          : (
            <>
              <Card padding="xl">
                <Stack gap={4} mb="lg">
                  <Title order={2} fz={24}>{doc.data.title}</Title>
                  <Text size="sm" c="dimmed">
                    請確認以下{view.kind === 'service' ? '紀錄' : '查核'}內容。你以「{view.content.signer.role}」{view.content.signer.name} 的身分簽核。
                  </Text>
                </Stack>
                {view.kind === 'service'
                  ? <RecordSections serviceOn={view.content.serviceOn ?? undefined} siteName={view.content.site ?? undefined} content={view.content.record} />
                  : <ReviewSections review={view.content} />}
              </Card>
              <SignCard token={token} doc={doc.data} />
            </>
          )}
      </Stack>
    </Box>
  );
}

/** Sign once, with an optional comment; a link opened again after signing shows when it was signed. */
function SignCard({ token, doc }: { token: string; doc: SignDocument }) {
  const [comment, setComment] = useState('');
  const sign = useMutation({
    mutationFn: () => data(api.POST('/api/sign/{token}', { params: { path: { token } }, body: comment.trim() ? { comment: comment.trim() } : {} })),
  });
  const done = sign.data ?? (doc.confirmedAt ? doc : undefined);
  return (
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
  );
}

/** 執行職務遭受不法侵害預防措施查核及評估: the review's basics, then each item with its checked points, result and fix. */
function ReviewSections({ review }: { review: ReviewSignContent }) {
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
        <Field label="檢核日期">{slashDate(review.reviewedOn)}</Field>
        <Field label="廠／院區">{review.site || '—'}</Field>
        <Field label="部門">{review.department || '—'}</Field>
      </SimpleGrid>
      <div>
        <SectionTitle>查核項目</SectionTitle>
        {review.items.length === 0 ? <Text size="sm" c="dimmed">未填寫</Text> : (
          <Stack gap="sm" mt="xs">
            {review.items.map((it, i) => (
              <Box key={i} p="md" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
                <Text fw={600} size="sm" mb={6}>{i + 1}. {it.item}</Text>
                <Group gap={6} mb="sm">
                  <Text size="xs" c="dimmed">已檢點：</Text>
                  {it.points.length === 0 ? <Text size="xs" c="dimmed">無</Text>
                    : it.points.map(p => <Badge key={p} variant="light" color="yutis" styles={{ root: { textTransform: 'none', fontWeight: 500 } }}>{p}</Badge>)}
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <Field label="結果">{it.result || '—'}</Field>
                  <Field label="修正相關控制措施／改善情形採行措施">{it.fix || '—'}</Field>
                </SimpleGrid>
              </Box>
            ))}
          </Stack>
        )}
      </div>
    </Stack>
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
