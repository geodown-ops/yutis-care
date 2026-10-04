import { ActionIcon, Alert, Button, Group, Menu, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconCalendarEvent, IconCheck, IconDots, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { addDays, todayIso, type FollowUp } from '../../cases';
import { actionErrorText, useFollowUp } from './queries';

/** Per follow-up on the home page: mark done, move the date, or write the record that answers it. */
export function FollowUpMenu({ f, onWrite }: { f: FollowUp; onWrite?: () => void }) {
  const done = useFollowUp();
  const [moving, setMoving] = useState(false);
  return (
    <Stack gap={2} align="flex-end">
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" loading={done.isPending} aria-label={`${f.employeeName} 的追蹤：更多動作`}><IconDots size={16} /></ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconCheck size={14} />} onClick={() => done.mutate({ recordId: f.recordId, employeeId: f.employeeId, body: { followUpDone: true } })}>完成追蹤</Menu.Item>
          <Menu.Item leftSection={<IconCalendarEvent size={14} />} onClick={() => setMoving(true)}>改期…</Menu.Item>
          {onWrite && <Menu.Item leftSection={<IconPencil size={14} />} onClick={onWrite}>寫協助紀錄並完成</Menu.Item>}
        </Menu.Dropdown>
      </Menu>
      {done.isError && <Text size="xs" c="var(--yutis-bad)" maw={140} ta="right">{actionErrorText(done.error)}</Text>}
      <Modal opened={moving} onClose={() => setMoving(false)} title={`改期 · ${f.employeeName}`} size="sm">
        {moving && <Reschedule f={f} onDone={() => setMoving(false)} />}
      </Modal>
    </Stack>
  );
}

function Reschedule({ f, onDone }: { f: FollowUp; onDone: () => void }) {
  const today = todayIso();
  const base = f.followUpOn < today ? today : f.followUpOn;
  const [on, setOn] = useState(addDays(base, 7));
  const move = useFollowUp();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(on) && on >= today;
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">{f.category} · 原訂 {f.followUpOn.replaceAll('-', '/')}</Text>
      <TextInput type="date" label="新的追蹤日期" min={today} value={on} onChange={e => setOn(e.currentTarget.value)}
        error={on && !valid ? '請選擇今天以後的日期' : undefined} />
      <Group gap={6}>
        {[7, 14, 30].map(n => <Button key={n} size="compact-sm" variant="default" onClick={() => setOn(addDays(today, n))}>{n} 天後</Button>)}
      </Group>
      {move.isError && <Alert color="red" variant="light">{actionErrorText(move.error)}</Alert>}
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onDone}>取消</Button>
        <Button disabled={!valid || on === f.followUpOn} loading={move.isPending}
          onClick={() => move.mutate({ recordId: f.recordId, employeeId: f.employeeId, body: { followUpOn: on } }, { onSuccess: onDone })}>改期</Button>
      </Group>
    </Stack>
  );
}
