import { Badge, Card, Group, Progress, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { StatCard } from '@yutis/ui';
import { STATUS_TONE, TENANTS } from '../demo';
import { AnchorLink, ButtonLink } from '../links';

export const Route = createFileRoute('/')({ component: TenantsPage });

function TenantsPage() {
  const active = TENANTS.filter(t => t.status === '啟用').length;
  const trial = TENANTS.filter(t => t.status === '試用').length;
  const seats = TENANTS.reduce((s, t) => s + t.employees, 0);
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>租戶列表</Title>
        <ButtonLink to="/$" params={{ _splat: 'tenants/new' }} leftSection={<IconPlus size={16} />}>新增租戶</ButtonLink>
      </Group>
      <Card>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <StatCard tone="lavender" label="啟用中租戶" value={active} />
          <StatCard tone="blue" label="試用中" value={trial} note="1 家 10/15 到期" />
          <StatCard tone="mint" label="員工總數" value={seats.toLocaleString('zh-TW')} />
          <StatCard tone="pink" label="待處理客服授權" value={1} />
        </SimpleGrid>
      </Card>
      <Card>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>租戶</Table.Th><Table.Th>子網域</Table.Th><Table.Th>狀態</Table.Th><Table.Th>方案</Table.Th><Table.Th>員工數／上限</Table.Th><Table.Th>登入</Table.Th><Table.Th>最後活動</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {TENANTS.map(t => {
                const tone = STATUS_TONE[t.status];
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td><AnchorLink to="/tenants/$tenantId" params={{ tenantId: t.id }} fw={600}>{t.name}</AnchorLink></Table.Td>
                    <Table.Td ff="monospace" fz="sm">{t.subdomain}.care.yutis.com.tw</Table.Td>
                    <Table.Td><Badge styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none' } }}>{t.status}</Badge></Table.Td>
                    <Table.Td>{t.plan}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{t.employees.toLocaleString('zh-TW')} / {t.seatLimit.toLocaleString('zh-TW')}</Text>
                      <Progress value={(t.employees / t.seatLimit) * 100} size="xs" mt={4} w={120} aria-label="人數用量" />
                    </Table.Td>
                    <Table.Td>{t.sso}</Table.Td>
                    <Table.Td>{t.lastActive}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      <Text size="xs" c="dimmed">平台後台只看得到租戶狀態與用量計數，看不到任何員工資料。</Text>
    </Stack>
  );
}
