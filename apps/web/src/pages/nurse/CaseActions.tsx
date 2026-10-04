import { Alert, Button, Group, Input, Modal, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput, type ButtonProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { CaseStatus } from '@yutis/domain';
import { CaseStatusBadge } from '@yutis/ui';
import { useState } from 'react';
import { caseMoves, knownStaff, openAction, type EmployeeCase } from '../../cases';
import { casesQuery } from '../../queries';
import { useMe } from '../../session';
import { caseChange, caseForm, type CaseForm, type Reply } from './caseEdit';
import { actionErrorText, useOpenCase, useUpdateCase } from './queries';

type Case = NonNullable<EmployeeCase['case']>;
export interface CaseTarget { employeeId: string; name: string; case: Case }

/** 開單 (new case, lead = me) or 併入個案 (new events into the running case); nothing when there are no new events. */
export function CaseOpenButton({ employeeId, kase, ...props }: { employeeId: string; kase: Pick<EmployeeCase, 'case' | 'events'> } & ButtonProps) {
  const open = useOpenCase();
  const action = openAction(kase);
  if (!action) return null;
  return (
    <Stack gap={4} align="flex-end">
      <Button loading={open.isPending} onClick={() => open.mutate(employeeId)} {...props}>{action}</Button>
      {open.isError && <Text size="xs" c="var(--yutis-bad)">{actionErrorText(open.error)}</Text>}
    </Stack>
  );
}

/** Status, lead and dates of a running case. Status only moves forward (起單 → 處理中 → 結案). */
export function CaseEditModal({ target, onClose }: { target: CaseTarget | null; onClose: () => void }) {
  return (
    <Modal opened={!!target} onClose={onClose} title={target ? `個案服務單 · ${target.name}` : ''} size="lg">
      {target && <CaseEditForm key={target.case.id} target={target} onDone={onClose} />}
    </Modal>
  );
}

const REPLIES: { value: Reply; label: string }[] = [{ value: 'none', label: '未回覆' }, { value: 'yes', label: '同意' }, { value: 'no', label: '不同意' }];

function CaseEditForm({ target, onDone }: { target: CaseTarget; onDone: () => void }) {
  const me = useMe();
  const c = target.case;
  const cases = useQuery(casesQuery);
  const [f, setF] = useState<CaseForm>(() => caseForm(c));
  const set = <K extends keyof CaseForm>(k: K, v: CaseForm[K]) => setF(x => ({ ...x, [k]: v }));
  const update = useUpdateCase();
  const staff = knownStaff(cases.data ?? [], me);
  if (c.leadUserId && !staff.some(s => s.value === c.leadUserId)) staff.push({ value: c.leadUserId, label: c.leadName ?? '目前主責' });
  const statuses: CaseStatus[] = [c.status, ...caseMoves(c.status)];
  const change = caseChange(c, f);
  const moved = f.status !== c.status;

  return (
    <Stack gap="md">
      <Input.Wrapper label="處理狀態">
        <div style={{ marginTop: 6 }}>
          {statuses.length > 1 ? (
            <SegmentedControl fullWidth value={f.status} onChange={v => set('status', v as CaseStatus)} aria-label="處理狀態"
              data={statuses.map(s => ({ value: s, label: s }))} />
          ) : <CaseStatusBadge status={c.status} />}
        </div>
        {f.status === '結案' && moved && <Text size="xs" c="dimmed" mt={6}>結案後，個案內的異常事件都會標示為結案；之後有新事件時會再出現在未開單。</Text>}
      </Input.Wrapper>
      {moved && (
        <Textarea label="狀態變更說明" description="記入狀態歷程" autosize minRows={2} maxLength={500}
          value={f.note} onChange={e => set('note', e.currentTarget.value)} />
      )}
      <Select label="主責" data={staff} value={f.leadUserId || null} onChange={v => v && set('leadUserId', v)} allowDeselect={false}
        description="可選擇自己，或目前已主責其他個案的同仁。" />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <TextInput type="date" label="通知日" value={f.noticeOn} onChange={e => set('noticeOn', e.currentTarget.value)} />
        <TextInput type="date" label="預計處理日" value={f.plannedOn} onChange={e => set('plannedOn', e.currentTarget.value)} />
        <TextInput type="date" label="回覆日" value={f.repliedOn} onChange={e => set('repliedOn', e.currentTarget.value)} />
      </SimpleGrid>
      <Input.Wrapper label="同意處理">
        <div style={{ marginTop: 6 }}>
          <SegmentedControl value={f.reply} onChange={v => set('reply', v as Reply)} data={REPLIES} aria-label="員工是否同意處理" />
        </div>
      </Input.Wrapper>
      {update.isError && <Alert color="red" variant="light">{actionErrorText(update.error)}</Alert>}
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onDone}>取消</Button>
        <Button loading={update.isPending} disabled={Object.keys(change).length === 0}
          onClick={() => update.mutate({ employeeId: target.employeeId, id: c.id, body: change }, { onSuccess: onDone })}>
          {change.status === '結案' ? '結案並儲存' : '儲存'}
        </Button>
      </Group>
    </Stack>
  );
}
