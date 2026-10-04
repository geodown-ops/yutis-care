import { ActionIcon, Button, Card, Chip, Group, Menu, SegmentedControl, SimpleGrid, Stack, Table, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core';
import { IconClipboardPlus, IconDots, IconEdit, IconPencilPlus, IconUserScan } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CASE_STATUSES, EVENT_TYPES, type CaseStatus, type EventType } from '@yutis/domain';
import { CaseStatusBadge, StatCard, type TileTone } from '@yutis/ui';
import { useState } from 'react';
import { byUrgency, countByStatus, eventTypes, filterByEvents, latestEventOn, openAction, runningCase, type EmployeeCase } from '../cases';
import { AnchorLink } from '../links';
import { casesQuery } from '../queries';
import { useMe } from '../session';
import { nurseAccess } from './nurse/access';
import { CaseEditModal, type CaseTarget } from './nurse/CaseActions';
import { actionErrorText, useAgeEvents, useOpenCase } from './nurse/queries';
import { RecordFormModal, type RecordFormTarget } from './nurse/RecordForm';
import { CardNote } from './states';

const TYPES = Object.keys(EVENT_TYPES) as EventType[];
const STATUS_TILE: Record<CaseStatus, TileTone> = { 未開單: 'pink', 起單: 'blue', 處理中: 'lavender', 結案: 'mint' };
const md = (d: string | null | undefined) => (d ? d.slice(5).replace('-', '/') : '—');

/** Employees of my sites with abnormal events, one row per person (their case gathers all events). */
export function CasesPage() {
  const me = useMe();
  const access = nurseAccess(me);
  const { data: cases } = useSuspenseQuery(casesQuery);
  const [selected, setSelected] = useState<EventType[]>([]);
  const [status, setStatus] = useState<CaseStatus | 'open' | 'all'>('open');
  const [editing, setEditing] = useState<CaseTarget | null>(null);
  const [writing, setWriting] = useState<RecordFormTarget | null>(null);
  const counts = countByStatus(cases);
  const rows = filterByEvents(cases, selected)
    .filter(c => (status === 'all' ? true : status === 'open' ? c.status !== '結案' : c.status === status))
    .sort(byUrgency);
  const actions = access.cases;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" gap="sm">
        <Title order={2}>個案管理</Title>
        {access.cases && <AgeEventsButton />}
      </Group>

      <Card>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          {CASE_STATUSES.map(s => <StatCard key={s} tone={STATUS_TILE[s]} label={s} value={counts[s]} />)}
        </SimpleGrid>
      </Card>

      <Card>
        <Group gap="sm" mb="sm" align="center" justify="space-between">
          <Chip.Group multiple value={selected} onChange={v => setSelected(v as EventType[])}>
            <Group gap={6}>{TYPES.map(t => <Chip key={t} value={t} size="xs">{EVENT_TYPES[t].short}</Chip>)}</Group>
          </Chip.Group>
          <SegmentedControl size="xs" value={status} onChange={v => setStatus(v as typeof status)} aria-label="個案狀態"
            data={[{ value: 'open', label: '未結案' }, ...CASE_STATUSES.map(s => ({ value: s, label: s })), { value: 'all', label: '全部' }]} />
        </Group>
        {selected.length > 1 && <Text size="xs" c="dimmed" mb="xs">同時符合 {selected.length} 項：{rows.length} 位</Text>}
        <Table.ScrollContainer minWidth={actions ? 880 : 820}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>員工</Table.Th><Table.Th>工號</Table.Th><Table.Th>部門</Table.Th><Table.Th>異常項目</Table.Th><Table.Th>最近事件</Table.Th><Table.Th>狀態</Table.Th><Table.Th>主責</Table.Th><Table.Th>預計處理</Table.Th>
                {actions && <Table.Th w={48}><VisuallyHidden>動作</VisuallyHidden></Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(c => (
                <Table.Tr key={c.employeeId}>
                  <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: c.employeeId }} fw={600}>{c.name}</AnchorLink></Table.Td>
                  <Table.Td ff="monospace" fz="sm">{c.empNo}</Table.Td>
                  <Table.Td>{c.department}</Table.Td>
                  <Table.Td>{eventTypes(c).map(t => EVENT_TYPES[t].short).join('、')}</Table.Td>
                  <Table.Td>{md(latestEventOn(c))}</Table.Td>
                  <Table.Td><CaseStatusBadge status={c.status} /></Table.Td>
                  <Table.Td>{c.case?.leadName ?? '—'}</Table.Td>
                  <Table.Td>{md(c.case?.plannedOn)}</Table.Td>
                  {actions && (
                    <Table.Td>
                      <CaseRowMenu c={c} canWrite={access.records}
                        onEdit={() => { const k = runningCase(c); if (k) setEditing({ employeeId: c.employeeId, name: c.name, case: k }); }}
                        onWrite={() => setWriting({ employeeId: c.employeeId, employeeName: c.name })} />
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && <CardNote>{selected.length > 1 ? '沒有同時符合這些異常類型的員工，試著少選一項。' : '沒有符合條件的個案。'}</CardNote>}
      </Card>
      <CaseEditModal target={editing} onClose={() => setEditing(null)} />
      <RecordFormModal target={writing} onClose={() => setWriting(null)} />
    </Stack>
  );
}

function CaseRowMenu({ c, canWrite, onEdit, onWrite }: { c: EmployeeCase; canWrite: boolean; onEdit: () => void; onWrite: () => void }) {
  const open = useOpenCase();
  const action = openAction(c);
  const running = runningCase(c);
  return (
    <Group gap={4} wrap="nowrap" justify="flex-end">
      {open.isError && <Tooltip label={actionErrorText(open.error)}><Text size="xs" c="var(--yutis-bad)">失敗</Text></Tooltip>}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" loading={open.isPending} aria-label={`${c.name}：個案動作`}><IconDots size={16} /></ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {action && <Menu.Item leftSection={<IconClipboardPlus size={14} />} onClick={() => open.mutate(c.employeeId)}>{action === '開單' ? '開單（主責為我）' : '把新事件併入個案'}</Menu.Item>}
          {running && <Menu.Item leftSection={<IconEdit size={14} />} onClick={onEdit}>編輯個案：狀態、主責、日期</Menu.Item>}
          {canWrite && <Menu.Item leftSection={<IconPencilPlus size={14} />} onClick={onWrite}>新增協助紀錄</Menu.Item>}
          {!action && !running && !canWrite && <Menu.Item disabled>沒有可執行的動作</Menu.Item>}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

/** POST /api/cases/age-events: one 年齡關注 event per active employee under 18 or at least 55 (never twice). */
function AgeEventsButton() {
  const scan = useAgeEvents();
  return (
    <Group gap="sm">
      {scan.isSuccess && <Text size="sm" c="dimmed" role="status">{scan.data.raised ? `新增 ${scan.data.raised} 件年齡關注事件` : '沒有新的年齡關注事件'}</Text>}
      {scan.isError && <Text size="sm" c="var(--yutis-bad)">{actionErrorText(scan.error)}</Text>}
      <Tooltip label="找出未滿 18 歲或已滿 55 歲的在職員工，各產生一件年齡關注事件" multiline w={240}>
        <Button variant="default" leftSection={<IconUserScan size={16} />} loading={scan.isPending} onClick={() => scan.mutate()}>更新年齡關注</Button>
      </Tooltip>
    </Group>
  );
}
