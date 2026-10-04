import { BarChart } from '@mantine/charts';
import { Box, Card, Chip, Grid, Group, Progress, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { EVENT_TYPES, type EventType, type Grade } from '@yutis/domain';
import { useState } from 'react';
import { CaseStatusBadge, GradeBadge, StatCard } from '@yutis/ui';
import { CASES, EMPLOYEES, MONTHLY_NEW_EVENTS, WEEK_SCHEDULE, countByStatus, employeeById, filterCasesByEvents, gradeOf } from '../demo';
import { AnchorLink, ButtonLink } from '../links';
import { useMe } from '../session';

const FILTERS: EventType[] = ['hc', 'wl', 'er', 'mat'];
const STATUS_ORDER = { 未開單: 0, 起單: 1, 處理中: 2, 結案: 3 } as const;
const GRADE_NAME = ['正常', '輕度異常', '中度異常', '嚴重異常'];

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

      <Card>
        <Group justify="space-between" mb="md">
          <Text fw={600} size="lg">本月概況</Text>
          <Text size="sm" c="dimmed">2026 年 10 月</Text>
        </Group>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <StatCard tone="pink" label="未開單異常" value={counts['未開單']} note="需要開單或指派" />
          <StatCard tone="lavender" label="處理中個案" value={counts['處理中'] + counts['起單']} note="比上月少 4 件" />
          <StatCard tone="blue" label="問卷待回收" value={42} note="3 份今天到期" />
          <StatCard tone="mint" label="待安排面談" value={5} note="醫師駐廠 10/08" />
        </SimpleGrid>
      </Card>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={600} size="lg">異常追蹤</Text>
              <ButtonLink to="/cases" variant="default" size="xs" rightSection={<IconArrowUpRight size={14} />}>全部個案</ButtonLink>
            </Group>
            <Chip.Group value={filter} onChange={v => setFilter(v as EventType | 'all')}>
              <Group gap={6} mb="sm">
                <Chip value="all" size="xs">全部</Chip>
                {FILTERS.map(t => <Chip key={t} value={t} size="xs">{EVENT_TYPES[t].short}</Chip>)}
              </Group>
            </Chip.Group>
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr><Table.Th>員工</Table.Th><Table.Th>部門</Table.Th><Table.Th>異常</Table.Th><Table.Th>健檢</Table.Th><Table.Th>狀態</Table.Th><Table.Th>主責</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map(c => {
                    const e = employeeById(c.employeeId)!;
                    return (
                      <Table.Tr key={c.id}>
                        <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: e.id }} size="sm" fw={600}>{e.name}</AnchorLink></Table.Td>
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
            <Text fw={600} size="lg" mb="md">本週行程</Text>
            <Stack gap={0}>
              {WEEK_SCHEDULE.map((ev, i) => (
                <Group key={ev.title} gap="sm" wrap="nowrap" align="stretch">
                  <Box w={40} pt={10} style={{ flexShrink: 0 }}>
                    <Text size="xs" c="dimmed" lh={1.2}>{ev.day}</Text>
                    <Text fw={600} lh={1.3}>10/{String(ev.date).padStart(2, '0')}</Text>
                  </Box>
                  {/* Timeline rail with a lavender dot, as in the reference's appointment list. */}
                  <Box aria-hidden w={10} style={{ position: 'relative', flexShrink: 0 }}>
                    <Box style={{ position: 'absolute', left: 4, top: i === 0 ? 18 : 0, bottom: i === WEEK_SCHEDULE.length - 1 ? 'calc(100% - 18px)' : 0, width: 2, background: 'var(--yutis-line-strong)' }} />
                    <Box style={{ position: 'absolute', left: 1, top: 14, width: 8, height: 8, borderRadius: '50%', background: 'var(--yutis-brand)' }} />
                  </Box>
                  <Box p="sm" mb={8} style={{ flex: 1, minWidth: 0, background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
                    <Text size="sm" fw={600}>{ev.title}</Text>
                    <Text size="xs" c="dimmed">{ev.detail}</Text>
                  </Box>
                </Group>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card h="100%">
            <Text fw={600} size="lg" mb="sm">近 12 個月新增異常</Text>
            <BarChart
              h={220}
              data={MONTHLY_NEW_EVENTS}
              dataKey="month"
              type="stacked"
              withLegend
              legendProps={{ verticalAlign: 'top', height: 32 }}
              maxBarWidth={28}
              series={[{ name: '健檢', color: 'var(--yutis-chart1)' }, { name: '問卷', color: 'var(--yutis-chart2)' }]}
            />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Text fw={600} size="lg">健檢分級分布</Text>
            <Text size="xs" c="dimmed" mb="md">2026 年度 · 依每人最高級別 · {EMPLOYEES.length} 人</Text>
            <Stack gap="md">
              {dist.map(({ g, n }) => (
                <div key={g}>
                  <Group justify="space-between" mb={6}>
                    <Group gap={8}><GradeBadge grade={g} /><Text size="sm">{GRADE_NAME[g - 1]}</Text></Group>
                    <Text size="sm" fw={600}>{n}<Text span size="xs" c="dimmed"> / {EMPLOYEES.length}</Text></Text>
                  </Group>
                  <Progress value={(n / EMPLOYEES.length) * 100} size="sm" aria-label={`${GRADE_NAME[g - 1]} ${n} 人`} />
                </div>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
