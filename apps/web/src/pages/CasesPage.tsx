import { Button, Card, Chip, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { CASE_STATUSES, EVENT_TYPES, type EventType } from '@yutis/domain';
import { useState } from 'react';
import { CaseStatusBadge, StatCard } from '@yutis/ui';
import { CASES, countByStatus, employeeById, filterCasesByEvents } from '../demo';
import { AnchorLink } from '../links';

const TYPES = Object.keys(EVENT_TYPES) as EventType[];

export function CasesPage() {
  const [selected, setSelected] = useState<EventType[]>([]);
  const counts = countByStatus(CASES);
  const rows = filterCasesByEvents(CASES, selected);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>個案管理</Title>
        <Group gap="sm"><Button variant="default">匯出</Button><Button>批次指派</Button></Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        {CASE_STATUSES.map(s => <StatCard key={s} label={<CaseStatusBadge status={s} />} value={counts[s]} />)}
      </SimpleGrid>

      <Card>
        <Group gap="sm" mb="sm" align="center">
          <Chip.Group multiple value={selected} onChange={v => setSelected(v as EventType[])}>
            <Group gap={6}>{TYPES.map(t => <Chip key={t} value={t} size="xs">{EVENT_TYPES[t].short}</Chip>)}</Group>
          </Chip.Group>
          {selected.length > 1 && <Text size="xs" c="dimmed">同時符合 {selected.length} 項：{rows.length} 件</Text>}
        </Group>
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>員工</Table.Th><Table.Th>部門</Table.Th><Table.Th>異常項目</Table.Th><Table.Th>最近處理</Table.Th><Table.Th>狀態</Table.Th><Table.Th>主責</Table.Th><Table.Th>下次追蹤</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(c => {
                const e = employeeById(c.employeeId)!;
                return (
                  <Table.Tr key={c.id}>
                    <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: e.id }}>{e.name}</AnchorLink></Table.Td>
                    <Table.Td>{e.dept}</Table.Td>
                    <Table.Td>{c.summary}</Table.Td>
                    <Table.Td>{c.lastAction ?? '—'}</Table.Td>
                    <Table.Td><CaseStatusBadge status={c.status} /></Table.Td>
                    <Table.Td>{c.owner ?? '—'}</Table.Td>
                    <Table.Td>{c.nextFollowUp?.slice(5).replace('-', '/') ?? '—'}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && <Text c="dimmed" ta="center" py="lg">沒有同時符合這些異常類型的個案，試著少選一項。</Text>}
      </Card>
    </Stack>
  );
}
