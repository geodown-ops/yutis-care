/*
 * What happens after an interview is saved: the employee confirms the outcome (員工確認) and the department manager is
 * told the work arrangement (通知主管). Shown with maternal and workload interviews, clinical staff only.
 */
import { ActionIcon, Box, Button, CopyButton, Group, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconBell, IconCheck, IconCopy } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { saveProblem, ToneBadge } from '../programs/maternalViolenceCommon';
import { ACK_LABEL, ACK_TONE, ackState, type AckStatus, type NoticeStatus, type NoticeSubject } from './advice';
import { NotifyManagerDialog } from './NotifyManagerDialog';

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const box = { background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' } as const;

export interface FollowUpProps {
  employee: { id: string; name: string };
  subjectTable: NoticeSubject;
  subjectId: string;
  /** Prefilled notice text. */
  advice: string;
  acknowledgement: AckStatus | null;
  notices: readonly NoticeStatus[];
  /** A confirmation link went out; the caller updates its cached copy. */
  onAcknowledgementSent: (sentAt: string) => void;
  onNoticeSent: (n: NoticeStatus) => void;
}

export function InterviewFollowUp(p: FollowUpProps) {
  const [notifying, setNotifying] = useState(false);
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <AcknowledgementBox ack={p.acknowledgement} onSent={p.onAcknowledgementSent} />
      <Box p="sm" style={box}>
        <Group justify="space-between" gap="xs" mb={6} wrap="nowrap">
          <Text size="sm" fw={600}>通知部門主管</Text>
          <Button size="compact-xs" variant="default" leftSection={<IconBell size={12} />} onClick={() => setNotifying(true)}>通知主管</Button>
        </Group>
        <NoticeList notices={p.notices} />
      </Box>
      <NotifyManagerDialog opened={notifying} onClose={() => setNotifying(false)} employee={p.employee} subjectTable={p.subjectTable} subjectId={p.subjectId}
        advice={p.advice} onSent={p.onNoticeSent} />
    </SimpleGrid>
  );
}

/** Notices sent about one interview and whether each manager has opened it. */
export function NoticeList({ notices }: { notices: readonly NoticeStatus[] }) {
  if (!notices.length) return <Text size="xs" c="dimmed">還沒有通知主管。主管只會收到工作安排建議，看不到面談內容。</Text>;
  return (
    <Stack gap={6}>
      {notices.map(n => (
        <Group key={n.id} justify="space-between" gap="xs" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text size="sm">{n.managerName}</Text>
            <Text size="xs" c="dimmed">{when(n.sentAt)} 寄出{n.readAt ? ` · ${when(n.readAt)} 已讀` : ''}</Text>
          </div>
          <ToneBadge tone={n.readAt ? 'ok' : 'warn'}>{n.readAt ? '已讀' : '未讀'}</ToneBadge>
        </Group>
      ))}
    </Stack>
  );
}

/**
 * 員工確認 (POST /api/programs/acknowledgements/{id}/link): a one-time link, valid 14 days, emailed when the employee
 * has an address and the mail service sends. The link is shown once and never stored; issuing a new one voids the old one.
 */
export function AcknowledgementBox({ ack, onSent }: { ack: AckStatus | null; onSent: (sentAt: string) => void }) {
  const link = useMutation({
    mutationFn: (id: string) => data(api.POST('/api/programs/acknowledgements/{id}/link', { params: { path: { id } } })),
    onSuccess: () => onSent(new Date().toISOString()),
  });
  const state = ack && ackState(ack);
  return (
    <Box p="sm" style={box}>
      <Group justify="space-between" gap="xs" mb={6} wrap="nowrap">
        <Text size="sm" fw={600}>員工確認</Text>
        {state && <ToneBadge tone={ACK_TONE[state]}>{ACK_LABEL[state]}</ToneBadge>}
      </Group>
      {!ack ? (
        <Text size="xs" c="dimmed">面談狀態存為「已面談」後，員工就能在員工端確認面談結果。</Text>
      ) : state === 'confirmed' ? (
        <>
          <Text size="xs" c="dimmed">{when(ack.confirmedAt)} 確認</Text>
          {ack.comment && <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>員工回覆：{ack.comment}</Text>}
        </>
      ) : (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            {state === 'sent' ? `${when(ack.sentAt)} 發出確認連結。重新產生會讓舊連結失效。` : '員工可以在員工端確認，也可以給員工一次性確認連結（14 天內有效）。'}
          </Text>
          {link.data ? <IssuedLink url={link.data.url} expiresAt={link.data.expiresAt} emailed={link.data.emailed} /> : (
            <div>
              <Button size="compact-xs" variant="default" loading={link.isPending} onClick={() => link.mutate(ack.id)}>
                {state === 'sent' ? '重新產生確認連結' : '產生確認連結'}
              </Button>
            </div>
          )}
        </Stack>
      )}
      {link.isError && <Text size="xs" c="var(--yutis-bad)" mt={4} role="alert">{saveProblem(link.error)}</Text>}
    </Box>
  );
}

function IssuedLink({ url, expiresAt, emailed }: { url: string; expiresAt: string; emailed: boolean }) {
  return (
    <Stack gap={4}>
      <Group gap={4} wrap="nowrap">
        <TextInput size="xs" readOnly value={url} aria-label="員工確認連結" style={{ flex: 1, minWidth: 0 }} onFocus={e => e.currentTarget.select()} />
        <CopyButton value={url}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已複製' : '複製連結'}>
              <ActionIcon variant="default" onClick={copy} aria-label="複製連結">{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}</ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      {/* emailed is true only when the mail service sends and the employee has an address (never on the demo site). */}
      <Text size="xs" c={emailed ? 'dimmed' : 'var(--yutis-warn)'} fw={emailed ? undefined : 600}>
        {emailed ? '已寄確認信給員工（信中不含健康內容）。' : '沒有寄出確認信，請複製連結交給員工。'}
      </Text>
      <Text size="xs" c="dimmed">連結只顯示這一次，有效至 {when(expiresAt)}。</Text>
    </Stack>
  );
}
