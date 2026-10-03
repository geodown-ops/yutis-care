import { BarChart } from '@mantine/charts';
import { Box, Card, Chip, Grid, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { EVENT_TYPES, type EventType, type Grade } from '@yutis/domain';
import { useState } from 'react';
import { CaseStatusBadge, GradeBadge, StatCard } from '@yutis/ui';
import { CASES, EMPLOYEES, MONTHLY_NEW_EVENTS, WEEK_SCHEDULE, countByStatus, employeeById, filterCasesByEvents, gradeOf } from '../demo';
import { AnchorLink } from '../links';
import { useMe } from '../session';

const FILTERS: EventType[] = ['hc', 'wl', 'er', 'mat'];
const STATUS_ORDER = { 未開單: 0, 起單: 1, 處理中: 2, 結案: 3 } as const;

export function HomePage() {
  const me = useMe();
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const counts = countByStatus(CASES);
  const rows = (filter === 'all' ? CASES : filterCasesByEvents(CASES, [filter]))
    .filter(c => c.status !== '結案')
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const dist = ([1, 2, 3, 4] as Grade[]).map(g => ({ g, n: EMPLOYEES.filter(e => gradeOf(e).max === g).length }));

  return (
    <Stack gap="lg">
      <Title order={2}>早安，{me.name.slice(1)}</Title>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatCard highlight label="未開單異常" value={counts['未開單']} note="需要開單或指派" />
        <StatCard label="處理中個案" value={counts['處理中'] + counts['起單']} note="比上月少 4 件" noteTone="down" />
        <StatCard label="問卷待回收" value={42} note="3 份今天到期" noteTone="up" />
        <StatCard label="待安排面談" value={5} note="醫師駐廠 10/08" />
      </SimpleGrid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
        <Card h="100%">
          <Group justify="space-between" mb="sm">
            <Text fw={600}>異常追蹤</Text>
            <AnchorLink to="/cases" size="sm">全部個案</AnchorLink>
          </Group>
          <Chip.Group value={filter} onChange={v => setFilter(v as EventType | 'all')}>
            <Group gap={6} mb="sm">
              <Chip value="all" size="xs">全部</Chip>
              {FILTERS.map(t => <Chip key={t} value={t} size="xs">{EVENT_TYPES[t].short}</Chip>)}
            </Group>
          </Chip.Group>
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>員工</Table.Th><Table.Th>部門</Table.Th><Table.Th>異常</Table.Th><Table.Th>健檢</Table.Th><Table.Th>狀態</Table.Th><Table.Th>主責</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(c => {
                  const e = employeeById(c.employeeId)!;
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: e.id }} size="sm">{e.name}</AnchorLink></Table.Td>
                      <Table.Td>{e.dept}</Table.Td>
                      <Table.Td>{c.summary}</Table.Td>
                      <Table.Td><GradeBadge grade={(gradeOf(e).max || null) as Grade | null} /></Table.Td>
                      <Table.Td><CaseStatusBadge status={c.status} /></Table.Td>
                      <Table.Td>{c.owner ?? '—'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <Text c="dimmed" size="sm" ta="center" py="md">這個類別目前沒有待處理的異常。</Text>}
        </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
        <Card h="100%">
          <Text fw={600} mb="sm">本週行程</Text>
          <Stack gap="sm">
            {WEEK_SCHEDULE.map(ev => (
              <Group key={ev.title} gap="sm" wrap="nowrap" align="center">
                <Box w={46} py={4} ta="center" style={{ background: 'var(--yutis-surface2)', borderRadius: 8, flexShrink: 0 }}>
                  <Text size="xs" c="dimmed" lh={1.2}>{ev.day}</Text>
                  <Text fw={700} lh={1.2}>{ev.date}</Text>
                </Box>
                <div>
                  <Text size="sm" fw={500}>{ev.title}</Text>
                  <Text size="xs" c="dimmed">{ev.detail}</Text>
                </div>
              </Group>
            ))}
          </Stack>
        </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
        <Card h="100%">
          <Text fw={600} mb="sm">近 12 個月新增異常</Text>
          <BarChart
            h={220}
            data={MONTHLY_NEW_EVENTS}
            dataKey="month"
            type="stacked"
            withLegend
            legendProps={{ verticalAlign: 'top', height: 32 }}
            series={[{ name: '健檢', color: 'var(--yutis-chart1)' }, { name: '問卷', color: 'var(--yutis-chart3)' }]}
          />
        </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
        <Card h="100%">
          <Text fw={600}>健檢分級分布</Text>
          <Text size="xs" c="dimmed" mb="sm">2026 年度 · 依每人最高級別 · {EMPLOYEES.length} 人</Text>
          <Stack gap="xs">
            {dist.map(({ g, n }) => (
              <Group key={g} justify="space-between">
                <Group gap={8}><GradeBadge grade={g} /><Text size="sm">{['正常', '輕度異常', '中度異常', '嚴重異常'][g - 1]}</Text></Group>
                <Text fw={700}>{n}</Text>
              </Group>
            ))}
          </Stack>
        </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
