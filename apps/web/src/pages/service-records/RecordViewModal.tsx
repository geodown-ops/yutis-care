import { ActionIcon, Alert, Anchor, Button, Collapse, CopyButton, Group, Modal, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { resendSignature, serviceRecordsQuery } from './queries';
import { RecordSections, SectionTitle, StatusBadge } from './parts';
import { serviceProblem, signProgress, type ServiceRecord, type Signature, type SignLink } from './records';

const pad = (n: number) => String(n).padStart(2, '0');
/** 2026/10/04 14:08, local time: short enough for the sign-off table. */
const dateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const nowrap = { whiteSpace: 'nowrap' } as const;

/** A submitted or completed record: the 附表八 content and who has signed (確認紀錄查詢). */
export function RecordViewModal({ record, onClose, onCopy, onResent }: {
  record: ServiceRecord; onClose: () => void; onCopy: () => void; onResent: (links: SignLink[]) => void;
}) {
  const phone = useMediaQuery('(max-width: 48em)');
  const { signed, total } = signProgress(record.signatures);
  return (
    <Modal opened onClose={onClose} size={1000} fullScreen={phone}
      title={<Group gap="sm"><Text fw={600}>勞工健康服務執行紀錄表</Text><StatusBadge status={record.status} /></Group>}>
      <Stack gap="xl">
        <RecordSections serviceOn={record.serviceOn} siteName={record.siteName} content={record.content} executor={record.executorName ?? '已刪除的帳號'} />
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
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>人員類別</Table.Th><Table.Th>姓名</Table.Th><Table.Th>狀態</Table.Th><Table.Th style={nowrap}>第一次寄送</Table.Th><Table.Th style={nowrap}>最後寄送</Table.Th><Table.Th style={nowrap}>回覆意見</Table.Th>
              {canResend && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {record.signatures.map(s => (
              <Table.Tr key={s.id}>
                <Table.Td style={nowrap}>{s.role}</Table.Td>
                <Table.Td><Text size="sm">{s.name}</Text><Text size="xs" c="dimmed">{s.email}</Text></Table.Td>
                <Table.Td style={nowrap}>
                  {s.signedAt ? <><Text size="sm" fw={600} c="var(--yutis-ok)">已簽核</Text><Text size="xs" c="dimmed">{dateTime(s.signedAt)}</Text></>
                    : s.sentAt ? <Text size="sm">待簽核</Text> : <Text size="sm" c="dimmed">未寄送</Text>}
                </Table.Td>
                <Table.Td style={nowrap}><Text size="sm">{s.firstSentAt ? dateTime(s.firstSentAt) : '—'}</Text></Table.Td>
                {/* Same as the first send until the link is sent again. */}
                <Table.Td style={nowrap}><Text size="sm" c={s.sentAt && s.sentAt === s.firstSentAt ? 'dimmed' : undefined}>{s.sentAt ? dateTime(s.sentAt) : '—'}</Text></Table.Td>
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

/**
 * After submit or resend. Where the API emails the links (production) this confirms that, and the one-time links stay
 * behind a toggle for a signer whose mail did not arrive. Where mail is only logged (local development, the demo
 * site) the links are the only way to reach the signers, so they are shown to copy or open.
 */
export function SignLinksModal({ title, links, emailed, onClose }: { title: string; links: SignLink[]; emailed: boolean; onClose: () => void }) {
  const [showLinks, setShowLinks] = useState(!emailed);
  const who = links.length === 1 ? links[0]!.name : `${links.length} 位簽核人員`;
  return (
    <Modal opened onClose={onClose} title={title} size="lg">
      <Stack gap="md">
        {emailed ? (
          <>
            <Text size="sm">已寄出簽核通知給 {who}，對方點信中的連結即可簽核。</Text>
            <div>
              <Button variant="subtle" size="compact-sm" onClick={() => setShowLinks(s => !s)}>{showLinks ? '收起連結' : '對方沒收到信？顯示簽核連結'}</Button>
              <Collapse expanded={showLinks}>
                <Stack gap="sm" mt="sm">
                  <Text size="xs" c="dimmed">連結只會顯示這一次。拿到連結的人都能以該簽核人員的身分簽核，請只轉交給本人。</Text>
                  <LinkList links={links} />
                </Stack>
              </Collapse>
            </div>
          </>
        ) : (
          <>
            <Alert color="yellow" variant="light" title="這個環境不會實際寄出 Email">
              本機開發與示範站只會記錄通知，不會寄出。請複製下面的連結轉交 {who}，或直接開啟試簽。連結只會顯示這一次。
            </Alert>
            <LinkList links={links} canOpen />
          </>
        )}
        <Group justify="flex-end"><Button onClick={onClose}>完成</Button></Group>
      </Stack>
    </Modal>
  );
}

function LinkList({ links, canOpen = false }: { links: SignLink[]; canOpen?: boolean }) {
  return (
    <Stack gap="sm">
      {links.map(l => (
        <div key={l.signatureId}>
          <Group justify="space-between" gap="xs" mb={4}>
            <Text size="sm" fw={600}>{l.role} · {l.name}</Text>
            {canOpen && <Anchor href={l.url} target="_blank" rel="noopener" size="xs"><Group gap={4} wrap="nowrap">開啟<IconExternalLink size={12} /></Group></Anchor>}
          </Group>
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
    </Stack>
  );
}
