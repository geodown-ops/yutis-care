/* Read-only pieces of a 附表八 record, shared by the back office and the public signing page. */
import { Badge, Box, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { readContent, SECTIONS, slashDate, timeRange, type ServiceStatus } from './records';

const STATUS_TONE: Record<ServiceStatus, 'info' | 'ok' | null> = { 草稿: null, 簽核中: 'info', 已完成: 'ok' };

export function StatusBadge({ status }: { status: ServiceStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <Badge
      leftSection={<Box component="span" w={6} h={6} style={{ borderRadius: '50%', background: 'currentColor' }} />}
      styles={{ root: {
        background: tone ? `var(--yutis-${tone}-weak)` : 'var(--yutis-surface2)', color: tone ? `var(--yutis-${tone})` : 'var(--yutis-muted)',
        textTransform: 'none', fontWeight: 600, height: 24, paddingInline: 10,
      } }}
    >
      {status}
    </Badge>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</Text>
    </div>
  );
}

/** A form section heading over a hairline, with an optional action on the right. */
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" pb={6} mb={4} mih={30} align="flex-end" style={{ borderBottom: '1px solid var(--yutis-line)' }}>
      <Text fw={600} size="sm">{children}</Text>
      {right}
    </Group>
  );
}

/** The record as 附表八 lays it out: basics, 一 site data, 二–五 free text. */
export function RecordSections({ serviceOn, siteName, content, executor }: { serviceOn: string | undefined; siteName: string | undefined; content: unknown; executor?: string }) {
  const c = readContent(content);
  const h = c.headcount;
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: executor ? 4 : 3 }} spacing="md">
        <Field label="執行日期">{slashDate(serviceOn)}</Field>
        <Field label="執行時間">{timeRange(c)}</Field>
        <Field label="地點">{siteName || '—'}</Field>
        {executor && <Field label="執行人員">{executor}</Field>}
      </SimpleGrid>

      <div>
        <SectionTitle>一、作業場所基本資料</SectionTitle>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Field label="事業單位">{c.unit || '—'}</Field>
            <Field label="部門名稱">{c.departmentName || '—'}</Field>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Field label="行政人員">男 {h.adminM} 人；女 {h.adminF} 人</Field>
            <Field label="現場操作人員">男 {h.opM} 人；女 {h.opF} 人</Field>
            <Field label="一般作業人數">{h.general} 人</Field>
          </SimpleGrid>
          <div>
            <Text size="xs" c="dimmed" mb={4}>特別危害健康作業類別與人數</Text>
            {c.special.length === 0 ? <Text size="sm">無</Text> : (
              <Table verticalSpacing={4} maw={320}>
                <Table.Tbody>
                  {c.special.map((s, i) => <Table.Tr key={i}><Table.Td>{s.category}</Table.Td><Table.Td ta="right" w={90}>{s.count} 人</Table.Td></Table.Tr>)}
                </Table.Tbody>
              </Table>
            )}
          </div>
        </Stack>
      </div>

      {SECTIONS.map(([key, title]) => (
        <div key={key}>
          <SectionTitle>{title}</SectionTitle>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} c={c[key] ? undefined : 'dimmed'}>{c[key] || '未填寫'}</Text>
        </div>
      ))}
    </Stack>
  );
}
