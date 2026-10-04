import { Anchor, Card, Group, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { StatCard } from '@yutis/ui';
import { useState } from 'react';
import { tenantsQuery, type Tenant } from '../api';
import { Footnote, LabelBadge, LoadError, PageLoader, SeatBar } from '../components';
import { formatCount, formatDate } from '../format';
import { SUBSCRIPTION_STATUS, TENANT_STATUS } from '../labels';
import { AnchorLink, ButtonLink } from '../links';
import { matchesTenant, tenantOverview } from '../tenants';

export const Route = createFileRoute('/')({ component: TenantsPage });

function TenantsPage() {
  const { data: tenants, error, refetch } = useQuery(tenantsQuery);
  const [query, setQuery] = useState('');
  const shown = tenants?.filter(t => matchesTenant(t, query));

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>租戶列表</Title>
        <ButtonLink to="/tenants/new" leftSection={<IconPlus size={16} />}>新增租戶</ButtonLink>
      </Group>
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : !tenants ? <PageLoader /> : (
        <>
          <Overview tenants={tenants} />
          <Card>
            <TextInput aria-label="搜尋租戶" placeholder="搜尋公司名稱或子網域" leftSection={<IconSearch size={16} />} maw={320} mb="sm"
              value={query} onChange={e => setQuery(e.currentTarget.value)} />
            <TenantTable tenants={shown ?? []} />
            {tenants.length === 0
              ? <Text c="dimmed" ta="center" py="lg">還沒有任何租戶，按「新增租戶」開通第一家。</Text>
              : shown?.length === 0 && <Text c="dimmed" ta="center" py="lg">沒有符合「{query.trim()}」的租戶。</Text>}
          </Card>
        </>
      )}
      <Footnote>平台後台只看得到租戶狀態與用量計數，看不到任何員工資料。</Footnote>
    </Stack>
  );
}

function Overview({ tenants }: { tenants: Tenant[] }) {
  const o = tenantOverview(tenants);
  return (
    <Card>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard tone="lavender" label="啟用中租戶" value={o.active} note={o.trial ? `其中 ${o.trial} 家試用中` : undefined} />
        <StatCard tone="blue" label="已停用" value={o.suspended} note={o.closed ? `另有 ${o.closed} 家已關閉` : undefined} />
        <StatCard tone="mint" label="在職員工總數" value={formatCount(o.activeEmployees)} note={`後台帳號 ${formatCount(o.staffAccounts)} 個`} />
        <StatCard tone="pink" label="超過人數上限" value={o.overSeatLimit} note="只提醒，不阻擋" />
      </SimpleGrid>
    </Card>
  );
}

function TenantTable({ tenants }: { tenants: Tenant[] }) {
  if (tenants.length === 0) return null;
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>租戶</Table.Th><Table.Th>狀態</Table.Th><Table.Th>方案</Table.Th><Table.Th>員工數／上限</Table.Th>
            <Table.Th>後台帳號</Table.Th><Table.Th>建立日期</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tenants.map(t => (
            <Table.Tr key={t.id}>
              <Table.Td>
                <AnchorLink to="/tenants/$tenantId" params={{ tenantId: t.id }} fw={600}>{t.name}</AnchorLink>
                <Anchor href={t.url} target="_blank" rel="noreferrer" display="block" size="xs" c="dimmed" ff="monospace">{t.url.replace(/^https?:\/\//, '')}</Anchor>
              </Table.Td>
              <Table.Td><LabelBadge value={TENANT_STATUS[t.status]} /></Table.Td>
              <Table.Td>
                {t.subscription ? (
                  <Group gap={8} wrap="nowrap">
                    <Text size="sm">{t.subscription.planName}</Text>
                    <LabelBadge value={SUBSCRIPTION_STATUS[t.subscription.status]} />
                  </Group>
                ) : <Text size="sm" c="dimmed">尚未設定訂閱</Text>}
              </Table.Td>
              <Table.Td><SeatBar activeEmployees={t.activeEmployees} seatLimit={t.subscription?.seatLimit ?? null} /></Table.Td>
              <Table.Td>{formatCount(t.staffAccounts)}</Table.Td>
              <Table.Td>{formatDate(t.createdAt)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
