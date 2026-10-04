import { Card, Chip, Group, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CASE_STATUSES, EVENT_TYPES, type CaseStatus, type EventType } from '@yutis/domain';
import { CaseStatusBadge, StatCard, type TileTone } from '@yutis/ui';
import { useState } from 'react';
import { byUrgency, countByStatus, eventTypes, filterByEvents, latestEventOn } from '../cases';
import { AnchorLink } from '../links';
import { casesQuery } from '../queries';
import { CardNote } from './states';

const TYPES = Object.keys(EVENT_TYPES) as EventType[];
const STATUS_TILE: Record<CaseStatus, TileTone> = { 未開單: 'pink', 起單: 'blue', 處理中: 'lavender', 結案: 'mint' };
const md = (d: string | null | undefined) => (d ? d.slice(5).replace('-', '/') : '—');

/** Employees of my sites with abnormal events, one row per person (their case gathers all events). */
export function CasesPage() {
  const { data: cases } = useSuspenseQuery(casesQuery);
  const [selected, setSelected] = useState<EventType[]>([]);
  const [status, setStatus] = useState<CaseStatus | 'open' | 'all'>('open');
  const counts = countByStatus(cases);
  const rows = filterByEvents(cases, selected)
    .filter(c => (status === 'all' ? true : status === 'open' ? c.status !== '結案' : c.status === status))
    .sort(byUrgency);

  return (
    <Stack gap="lg">
      <Title order={2}>個案管理</Title>

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
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>員工</Table.Th><Table.Th>工號</Table.Th><Table.Th>部門</Table.Th><Table.Th>異常項目</Table.Th><Table.Th>最近事件</Table.Th><Table.Th>狀態</Table.Th><Table.Th>主責</Table.Th><Table.Th>預計處理</Table.Th></Table.Tr>
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
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && <CardNote>{selected.length > 1 ? '沒有同時符合這些異常類型的員工，試著少選一項。' : '沒有符合條件的個案。'}</CardNote>}
      </Card>
    </Stack>
  );
}
