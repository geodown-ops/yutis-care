import { BarChart } from '@mantine/charts';
import { Box, Card, Chip, Grid, Group, Progress, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { Schemas } from '@yutis/api-client';
import { EVENT_TYPES, parseDate, toIsoDate, type EventType, type Grade } from '@yutis/domain';
import { CaseStatusBadge, GradeBadge, StatCard } from '@yutis/ui';
import { useState } from 'react';
import { byUrgency, countByStatus, dueFollowUps, EVENT_SERIES, eventTypes, filterByEvents, latestEventOn, monthlyEvents, todayIso } from '../cases';
import { AnchorLink, ButtonLink } from '../links';
import { casesQuery, ergoDispatchesQuery, followUpsQuery, reportQuery } from '../queries';
import { useMe } from '../session';
import { CardNote } from './states';

const FILTERS: EventType[] = ['hc', 'wl', 'er', 'mat'];
const GRADE_NAME = ['正常', '輕度異常', '中度異常', '嚴重異常'];
const WEEKDAY = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const SERIES_COLOR = ['var(--yutis-chart1)', 'var(--yutis-chart2)', 'var(--yutis-chart3)'];

const greeting = () => { const h = new Date().getHours(); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; };
const md = (d: string) => d.slice(5).replace('-', '/');

export function HomePage() {
  const me = useMe();
  const today = todayIso();
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const cases = useQuery(casesQuery);
  const followUps = useQuery(followUpsQuery);
  const dispatches = useQuery(ergoDispatchesQuery);
  const grades = useQuery(reportQuery('health', 'grade'));

  const counts = cases.data && countByStatus(cases.data);
  const due = followUps.data ? dueFollowUps(followUps.data, today) : [];
  const overdue = due.filter(f => f.daysLeft < 0).length;
  const unfilled = dispatches.data?.reduce((n, d) => n + d.total - d.filled, 0);
  const dueSoon = dispatches.data?.filter(d => d.dueOn && d.total > d.filled && d.dueOn >= today && d.dueOn <= addDays(today, 3)).length ?? 0;
  const rows = (cases.data ?? []).filter(c => c.status !== '結案');
  const shown = (filter === 'all' ? rows : filterByEvents(rows, [filter])).sort(byUrgency);

  return (
    <Stack gap="lg">
      <Title order={2}>{greeting()}，{me.name}</Title>

      <Card>
        <Group justify="space-between" mb="md">
          <Text fw={600} size="lg">目前概況</Text>
          <Text size="sm" c="dimmed">{me.sites.map(s => s.name).join('、') || '尚未指派負責廠區'}</Text>
        </Group>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <StatCard tone="pink" label="未開單異常" value={counts ? counts['未開單'] : '—'} note="需要開單或指派" />
          <StatCard tone="lavender" label="處理中個案" value={counts ? counts['起單'] + counts['處理中'] : '—'} note={counts ? `其中起單 ${counts['起單']} 件` : undefined} />
          <StatCard tone="blue" label="問卷待回收" value={unfilled ?? '—'} note={dueSoon ? `${dueSoon} 批 3 天內到期` : '人因問卷'} />
          <StatCard tone="mint" label="7 天內待追蹤" value={followUps.data ? due.length : '—'} note={overdue ? `${overdue} 件已逾期` : '協助紀錄的追蹤日'} />
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
            {cases.isPending ? <Skeleton h={180} /> : cases.isError ? <CardNote>暫時無法載入個案，請重新整理。</CardNote> : (
              <>
                <Table.ScrollContainer minWidth={560}>
                  <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                      <Table.Tr><Table.Th>員工</Table.Th><Table.Th>部門</Table.Th><Table.Th>異常</Table.Th><Table.Th>最近事件</Table.Th><Table.Th>狀態</Table.Th><Table.Th>主責</Table.Th></Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {shown.slice(0, 8).map(c => (
                        <Table.Tr key={c.employeeId}>
                          <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: c.employeeId }} size="sm" fw={600}>{c.name}</AnchorLink></Table.Td>
                          <Table.Td>{c.department}</Table.Td>
                          <Table.Td>{eventTypes(c).map(t => EVENT_TYPES[t].short).join('、')}</Table.Td>
                          <Table.Td>{md(latestEventOn(c) ?? '')}</Table.Td>
                          <Table.Td><CaseStatusBadge status={c.status} /></Table.Td>
                          <Table.Td>{c.case?.leadName ?? '—'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
                {shown.length === 0 && <CardNote>{filter === 'all' ? '目前沒有待處理的異常。' : '這個類別目前沒有待處理的異常。'}</CardNote>}
                {shown.length > 8 && <Text size="xs" c="dimmed" mt="xs">還有 {shown.length - 8} 位，請到個案管理查看。</Text>}
              </>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Text fw={600} size="lg" mb="md">近期追蹤</Text>
            {followUps.isPending ? <Skeleton h={180} /> : due.length === 0 ? <CardNote>未來 7 天沒有要追蹤的協助紀錄。</CardNote> : (
              <Stack gap={0}>
                {due.slice(0, 6).map((f, i, list) => (
                  <Group key={f.recordId} gap="sm" wrap="nowrap" align="stretch">
                    <Box w={44} pt={10} style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed" lh={1.2}>{WEEKDAY[parseDate(f.followUpOn).getDay()]}</Text>
                      <Text fw={600} lh={1.3}>{md(f.followUpOn)}</Text>
                    </Box>
                    {/* Timeline rail with a lavender dot, as in the reference's appointment list. */}
                    <Box aria-hidden w={10} style={{ position: 'relative', flexShrink: 0 }}>
                      <Box style={{ position: 'absolute', left: 4, top: i === 0 ? 18 : 0, bottom: i === list.length - 1 ? 'calc(100% - 18px)' : 0, width: 2, background: 'var(--yutis-line-strong)' }} />
                      <Box style={{ position: 'absolute', left: 1, top: 14, width: 8, height: 8, borderRadius: '50%', background: f.daysLeft < 0 ? 'var(--yutis-bad)' : 'var(--yutis-brand)' }} />
                    </Box>
                    <Box p="sm" mb={8} style={{ flex: 1, minWidth: 0, background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
                      <AnchorLink to="/employees/$employeeId" params={{ employeeId: f.employeeId }} size="sm" fw={600} c="var(--mantine-color-text)">{f.employeeName} · {f.category}</AnchorLink>
                      <Text size="xs" c={f.daysLeft < 0 ? 'var(--yutis-bad)' : 'dimmed'}>{f.daysLeft < 0 ? `已逾期 ${-f.daysLeft} 天` : f.daysLeft === 0 ? '今天' : `${f.daysLeft} 天後`} · {f.empNo}</Text>
                    </Box>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card h="100%">
            <Text fw={600} size="lg" mb="sm">近 12 個月新增異常事件</Text>
            {cases.data ? (
              <BarChart h={220} data={monthlyEvents(cases.data, today)} dataKey="month" type="stacked" withLegend
                legendProps={{ verticalAlign: 'top', height: 32 }} maxBarWidth={28}
                series={EVENT_SERIES.map((s, i) => ({ name: s.name, color: SERIES_COLOR[i]! }))} />
            ) : <Skeleton h={220} />}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Text fw={600} size="lg">健檢分級分布</Text>
            {grades.isPending ? <Skeleton h={180} mt="md" /> : grades.isError || grades.data.suppressed ? <CardNote>目前沒有可顯示的健檢分級。</CardNote> : (
              <GradeDistribution report={grades.data} />
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function GradeDistribution({ report }: { report: Schemas['ReportDto'] }) {
  const total = Number(report.summary.find(s => s.label === '受檢人數')?.value ?? 0);
  const dist = report.rows.map(r => ({ g: Number(String(r[0]).match(/\d/)?.[0]) as Grade, n: Number(r[1]) })).filter(r => r.g >= 1 && r.g <= 4);
  return (
    <>
      <Text size="xs" c="dimmed" mb="md">負責廠區 · 依每人最高級別 · {total} 人</Text>
      <Stack gap="md">
        {dist.map(({ g, n }) => (
          <div key={g}>
            <Group justify="space-between" mb={6}>
              <Group gap={8}><GradeBadge grade={g} /><Text size="sm">{GRADE_NAME[g - 1]}</Text></Group>
              <Text size="sm" fw={600}>{n}<Text span size="xs" c="dimmed"> / {total}</Text></Text>
            </Group>
            <Progress value={total ? (n / total) * 100 : 0} size="sm" aria-label={`${GRADE_NAME[g - 1]} ${n} 人`} />
          </div>
        ))}
      </Stack>
    </>
  );
}

function addDays(d: string, n: number) {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toIsoDate(x);
}
