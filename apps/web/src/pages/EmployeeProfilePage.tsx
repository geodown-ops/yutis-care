import { Avatar, Badge, Box, Breadcrumbs, Button, Card, Grid, Group, Stack, Table, Tabs, Text, Timeline, Title, UnstyledButton } from '@mantine/core';
import { ageAt, cvdScore, LOAD_LABEL, MATRIX, RISK_LABEL, type Level3 } from '@yutis/domain';
import { useState } from 'react';
import { GradeBadge } from '@yutis/ui';
import { CASES, TODAY, employeeById, gradeOf } from '../demo';
import { AnchorLink } from '../links';
import { PlaceholderPage } from './PlaceholderPage';

const CVD_BANDS = ['<10%', '10–20%', '≥20%'];
const RISK_TONE = ['ok', 'warn', 'bad'] as const;
/** Demo workload level until the overwork questionnaire API exists. */
const DEMO_LOAD: Level3 = 1;

function RiskMatrix({ band, load }: { band: Level3; load: Level3 }) {
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: '64px repeat(3, 1fr)', gap: 4, textAlign: 'center', fontSize: 12 }} role="table" aria-label="異常工作負荷風險矩陣">
      <span />
      {LOAD_LABEL.map(l => <Text key={l} size="xs" c="dimmed" py={4}>{l}</Text>)}
      {MATRIX.map((row, b) => [
        <Text key={`h${b}`} size="xs" c="dimmed" py={10}>{CVD_BANDS[b]}</Text>,
        ...row.map((lv, l) => {
          const me = b === band && l === load;
          const tone = RISK_TONE[lv];
          return (
            <Box key={`${b}-${l}`} py={10} fw={600} style={{
              borderRadius: 8, background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`,
              outline: me ? '2px solid var(--mantine-color-text)' : undefined, outlineOffset: -2,
            }} aria-current={me ? 'true' : undefined}>
              {RISK_LABEL[lv].slice(0, 1)}
            </Box>
          );
        }),
      ])}
    </Box>
  );
}

export function EmployeeProfilePage({ id, showHealth }: { id: string; showHealth: boolean }) {
  const e = employeeById(id);
  const [showId, setShowId] = useState(false);
  if (!e) return <PlaceholderPage title="找不到這位員工" missing />;

  const grade = gradeOf(e);
  const abnormal = grade.items.filter(i => (i.lv ?? 0) >= 2).sort((a, b) => (b.lv ?? 0) - (a.lv ?? 0));
  const cvd = cvdScore({ sex: e.sex, birth: e.birth, report: e.exam });
  const lv = MATRIX[cvd.band]?.[DEMO_LOAD] ?? 0;
  const openCases = CASES.filter(c => c.employeeId === e.id && c.status !== '結案');

  return (
    <Stack gap="lg">
      <Breadcrumbs><AnchorLink to="/employees" size="sm">員工資料</AnchorLink><Text size="sm">{e.name}</Text></Breadcrumbs>

      <Card>
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="md" wrap="nowrap">
            <Avatar color="yutis" radius="lg" size={56}>{e.name[0]}</Avatar>
            <div>
              <Group gap="xs">
                <Title order={3}>{e.name}</Title>
                {showHealth && openCases.length > 0 && <Badge color="red">未結案個案 {openCases.length}</Badge>}
              </Group>
              <Group gap="md" c="dimmed" fz="sm">
                <span>{e.id}</span><span>{e.dept} · {e.title}</span><span>{e.sex} · {ageAt(e.birth, TODAY)} 歲</span><span>{e.shift}</span>
                <span>身分證 <UnstyledButton fz="sm" c="dimmed" onClick={() => setShowId(v => !v)} title="正式版點開會寫入存取紀錄">{showId ? '（示範資料不提供完整號碼）' : e.nationalIdMasked}</UnstyledButton></span>
              </Group>
            </div>
          </Group>
          {showHealth && <Group gap="sm">
            <Button variant="default">新增協助紀錄</Button>
            <Button>開立個案</Button>
          </Group>}
        </Group>
        {showHealth && <Tabs defaultValue="overview" mt="md">
          <Tabs.List>
            <Tabs.Tab value="overview">總覽</Tabs.Tab>
            <Tabs.Tab value="exam">健檢報告</Tabs.Tab>
            <Tabs.Tab value="notes">協助紀錄</Tabs.Tab>
            <Tabs.Tab value="programs">計畫結果</Tabs.Tab>
            <Tabs.Tab value="audit">存取紀錄</Tabs.Tab>
          </Tabs.List>
        </Tabs>}
      </Card>

      {showHealth ? (
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <Card h="100%">
            <Group justify="space-between" mb="xs"><Text fw={600}>{e.exam.date.slice(0, 4)} 健檢</Text><Text size="xs" c="dimmed">總分 {grade.total} · 最高 {grade.max} 級</Text></Group>
            <Table verticalSpacing={6}>
              <Table.Tbody>
                {abnormal.map(i => (
                  <Table.Tr key={i.key}>
                    <Table.Td>{i.name}</Table.Td>
                    <Table.Td ta="right">{String(i.v)} <Text span size="xs" c="dimmed">{i.unit}</Text></Table.Td>
                    <Table.Td w={30}><GradeBadge grade={i.lv} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {abnormal.length === 0 && <Text size="sm" c="dimmed">所有項目都在 1 級。</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <Card h="100%">
            <Group justify="space-between" mb="xs"><Text fw={600}>異常工作負荷</Text><Text size="xs" c="dimmed">10 年心血管風險 {cvd.risk}%</Text></Group>
            <RiskMatrix band={cvd.band} load={DEMO_LOAD} />
            <Text size="xs" c="dimmed" mt="sm">{RISK_LABEL[lv]}。工作負荷為示範值，正式版取自過勞量表與加班時數。</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Text fw={600} mb="sm">近期紀錄</Text>
            <Timeline bulletSize={10} lineWidth={2}>
              <Timeline.Item title="健檢匯入"><Text size="xs" c="dimmed">{e.exam.date}</Text></Timeline.Item>
              {openCases.map(c => <Timeline.Item key={c.id} title={c.summary}><Text size="xs" c="dimmed">{c.lastAction ?? '尚未開單'}</Text></Timeline.Item>)}
            </Timeline>
          </Card>
        </Grid.Col>
      </Grid>
      ) : (
        <Card>
          <Text fw={600} mb={4}>工作安排建議</Text>
          <Text size="sm" c="dimmed">目前沒有需要調整的工作安排。健檢數值與個案內容只有醫護人員看得到。</Text>
        </Card>
      )}
    </Stack>
  );
}
