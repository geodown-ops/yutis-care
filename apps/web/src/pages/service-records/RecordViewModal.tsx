import { ActionIcon, Button, CopyButton, Group, Modal, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMe } from '../../session';
import { resendSignature, serviceRecordsQuery } from './queries';
import { RecordSections, SectionTitle, StatusBadge } from './parts';
import { readContent, serviceProblem, signProgress, type ServiceRecord, type Signature, type SignLink } from './records';

const dateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

/** A submitted or completed record: the 附表八 content and who has signed (確認紀錄查詢). */
export function RecordViewModal({ record, onClose, onCopy, onResent }: {
  record: ServiceRecord; onClose: () => void; onCopy: () => void; onResent: (links: SignLink[]) => void;
}) {
  const me = useMe();
  const phone = useMediaQuery('(max-width: 48em)');
  const { signed, total } = signProgress(record.signatures);
  const executor = readContent(record.content).executorUserId === me.id ? me.name : undefined;
  return (
    <Modal opened onClose={onClose} size={1000} fullScreen={phone}
      title={<Group gap="sm"><Text fw={600}>勞工健康服務執行紀錄表</Text><StatusBadge status={record.status} /></Group>}>
      <Stack gap="xl">
        <RecordSections serviceOn={record.serviceOn} siteName={record.siteName} content={record.content} executor={executor} />
        <div>
          <SectionTitle right={<Text size="xs" c="dimmed">{signed}／{total} 已簽核</Text>}>六、簽核紀錄</SectionTitle>
          <Signatures record={record} onResent={onResent} />
        </div>
        <Group justify="flex-end" gap="sm" pt="md" style={{ borderTop: '1px solid var(--yutis-line)' }}>
          <Button variant="default" onClick={onCopy}>複製為新紀錄</Button>
          <Button variant="subtle" color="gray" onClick={onClose}>關閉</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Signatures({ record, onResent }: { record: ServiceRecord; onResent: (links: SignLink[]) => void }) {
  const qc = useQueryClient();
  const resend = useMutation({
    mutationFn: (s: Signature) => resendSignature(record.id, s.id),
    onSuccess: link => { void qc.invalidateQueries({ queryKey: serviceRecordsQuery.queryKey }); onResent([link]); },
  });
  const canResend = record.status === '簽核中';
  return (
    <>
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>人員類別</Table.Th><Table.Th>姓名</Table.Th><Table.Th>狀態</Table.Th><Table.Th>最後寄送</Table.Th><Table.Th>回覆意見</Table.Th>{canResend && <Table.Th />}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {record.signatures.map(s => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.role}</Table.Td>
                <Table.Td><Text size="sm">{s.name}</Text><Text size="xs" c="dimmed">{s.email}</Text></Table.Td>
                <Table.Td>
                  {s.signedAt ? <><Text size="sm" fw={600} c="var(--yutis-ok)">已簽核</Text><Text size="xs" c="dimmed">{dateTime(s.signedAt)}</Text></>
                    : s.sentAt ? <Text size="sm">待簽核</Text> : <Text size="sm" c="dimmed">未寄送</Text>}
                </Table.Td>
                <Table.Td><Text size="sm">{s.sentAt ? dateTime(s.sentAt) : '—'}</Text></Table.Td>
                <Table.Td><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{s.comment || '—'}</Text></Table.Td>
                {canResend && (
                  <Table.Td ta="right">
                    {!s.signedAt && <Button size="xs" variant="default" loading={resend.isPending && resend.variables?.id === s.id} onClick={() => resend.mutate(s)}>重寄連結</Button>}
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {resend.isError && <Text size="sm" c="var(--yutis-bad)" mt="xs" role="alert">{serviceProblem(resend.error)}</Text>}
      {canResend && <Text size="xs" c="dimmed" mt="xs">重寄後，舊的連結隨即失效。</Text>}
    </>
  );
}

/** The one-time links from submit/resend. The API returns them only once, so they are shown here for copying. */
export function SignLinksModal({ title, links, onClose }: { title: string; links: SignLink[]; onClose: () => void }) {
  return (
    <Modal opened onClose={onClose} title={title} size="lg">
      <Stack gap="md">
        <Text size="sm">簽核通知已排入寄送。下面的連結只會顯示這一次，需要時可以複製後自行轉交簽核人員。</Text>
        {links.map(l => (
          <div key={l.signatureId}>
            <Text size="sm" fw={600} mb={4}>{l.role} · {l.name}</Text>
            <TextInput readOnly value={l.url} aria-label={`${l.name} 的簽核連結`} onFocus={e => e.currentTarget.select()} styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
              rightSection={(
                <CopyButton value={l.url}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? '已複製' : '複製連結'} withArrow>
                      <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy} aria-label={`複製 ${l.name} 的簽核連結`}>
                        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              )} />
          </div>
        ))}
        <Group justify="flex-end"><Button onClick={onClose}>完成</Button></Group>
      </Stack>
    </Modal>
  );
}
