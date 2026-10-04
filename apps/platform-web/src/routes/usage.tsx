import { Card, Group, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { StatCard } from '@yutis/ui';
import { useState } from 'react';
import { usageQuery } from '../api';
import { Footnote, LoadError, PageLoader, SeatBar } from '../components';
import { formatCount, formatMonth, monthInTaipei, recentMonths } from '../format';
import { AnchorLink } from '../links';
import { usageTotals } from '../tenants';

export const Route = createFileRoute('/usage')({ component: UsagePage });

function UsagePage() {
  const thisMonth = monthInTaipei();
  const [month, setMonth] = useState(thisMonth);
  const { data: rows, error, refetch, isPlaceholderData } = useQuery({ ...usageQuery(month), placeholderData: keepPreviousData });
  const totals = rows && usageTotals(rows);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>用量</Title>
        <Select aria-label="月份" w={170} allowDeselect={false} value={month} onChange={v => v && setMonth(v)}
          data={recentMonths(thisMonth, 24).map(m => ({ value: m, label: formatMonth(m) }))} />
      </Group>
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : !rows || !totals ? <PageLoader /> : (
        <>
          <Card style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
              <StatCard tone="lavender" label="在職員工" value={formatCount(totals.activeEmployees)} note="目前" />
              <StatCard tone="blue" label="後台帳號" value={formatCount(totals.staffAccounts)} note="目前" />
              <StatCard tone="mint" label="健檢筆數" value={formatCount(totals.examsInMonth)} note={formatMonth(month)} />
              <StatCard tone="pink" label="簡訊則數" value={formatCount(totals.smsSent)} note={formatMonth(month)} />
            </SimpleGrid>
          </Card>
          <Card style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>租戶</Table.Th><Table.Th>在職員工／上限</Table.Th><Table.Th ta="right">後台帳號</Table.Th>
                    <Table.Th ta="right">健檢筆數</Table.Th><Table.Th ta="right">簡訊則數</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map(r => (
                    <Table.Tr key={r.tenantId}>
                      <Table.Td>
                        <AnchorLink to="/tenants/$tenantId" params={{ tenantId: r.tenantId }} fw={600}>{r.name}</AnchorLink>
                        <Text size="xs" c="dimmed" ff="monospace">{r.subdomain}</Text>
                      </Table.Td>
                      <Table.Td><SeatBar activeEmployees={r.activeEmployees} seatLimit={r.seatLimit} /></Table.Td>
                      <Table.Td ta="right">{formatCount(r.staffAccounts)}</Table.Td>
                      <Table.Td ta="right">{formatCount(r.examsInMonth)}</Table.Td>
                      <Table.Td ta="right">{formatCount(r.smsSent)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {rows.length === 0 && <Text c="dimmed" ta="center" py="lg">還沒有任何租戶。</Text>}
          </Card>
        </>
      )}
      <Footnote>在職員工與後台帳號是目前的數字；健檢與簡訊是所選月份的數字。簡訊費用由營運商負擔，按租戶記錄。平台只拿得到計數，看不到任何一筆明細。</Footnote>
    </Stack>
  );
}
