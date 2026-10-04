/*
 * 稽核紀錄 (GET /platform-api/audit): every change made in the platform admin, newest first, with filters.
 * Platform users can be picked as a filter only by roles that may list them (platform-users:manage).
 */
import { Button, Card, Group, Pagination, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { auditQuery, plansQuery, platformUsersQuery, tenantsQuery } from './api';
import {
  AUDIT_ACTIONS, AUDIT_PAGE_SIZE, auditActionLabel, auditQueryParams, auditSummary, emptyAuditFilters, type AuditFilterForm,
} from './audit';
import { LoadError, PageLoader } from './components';
import { formatCount, formatDateTime } from './format';
import { AnchorLink } from './links';
import { useCan } from './permissions';

const ACTION_OPTIONS = Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }));

export function AuditLog() {
  const canSeeUsers = useCan('platform-users:manage');
  const [filters, setFilters] = useState<AuditFilterForm>(emptyAuditFilters);
  const [page, setPage] = useState(0);
  const query = auditQueryParams(filters, page);
  const log = useQuery({ ...auditQuery(query), placeholderData: keepPreviousData });
  const tenants = useQuery(tenantsQuery);
  const plans = useQuery(plansQuery);
  const users = useQuery({ ...platformUsersQuery, enabled: canSeeUsers });

  const names = useMemo(() => ({
    plans: new Map((plans.data ?? []).map(p => [p.id, p.name])),
    users: new Map((users.data ?? []).map(u => [u.id, u.name])),
  }), [plans.data, users.data]);

  const set = <K extends keyof AuditFilterForm>(k: K, v: AuditFilterForm[K]) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };
  const filtered = Object.values(filters).some(Boolean);
  const pages = log.data ? Math.ceil(log.data.total / AUDIT_PAGE_SIZE) : 0;

  return (
    <Card>
      <Group justify="space-between" mb="sm">
        <Text fw={600}>稽核紀錄</Text>
        {log.data && <Text size="sm" c="dimmed">共 {formatCount(log.data.total)} 筆</Text>}
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, md: canSeeUsers ? 5 : 4 }} spacing="sm" mb="md">
        <Select label="租戶" placeholder="全部租戶" clearable searchable value={filters.tenantId || null} onChange={v => set('tenantId', v ?? '')}
          data={(tenants.data ?? []).map(t => ({ value: t.id, label: `${t.name}（${t.subdomain}）` }))} nothingFoundMessage="沒有符合的租戶" />
        <Select label="動作" placeholder="全部動作" clearable value={filters.action || null} onChange={v => set('action', v ?? '')} data={ACTION_OPTIONS} />
        {canSeeUsers && (
          <Select label="平台人員" placeholder="全部人員" clearable searchable value={filters.actorId || null} onChange={v => set('actorId', v ?? '')}
            data={(users.data ?? []).map(u => ({ value: u.id, label: u.name }))} nothingFoundMessage="沒有符合的人員" />
        )}
        <TextInput type="date" label="從" value={filters.from} onChange={e => set('from', e.currentTarget.value)} />
        <TextInput type="date" label="到" value={filters.to} onChange={e => set('to', e.currentTarget.value)} />
      </SimpleGrid>
      {filtered && (
        <Group justify="flex-end" mt={-8} mb="sm">
          <Button variant="subtle" size="compact-sm" onClick={() => { setFilters(emptyAuditFilters()); setPage(0); }}>清除條件</Button>
        </Group>
      )}

      {log.error ? <LoadError error={log.error} onRetry={() => void log.refetch()} /> : !log.data ? <PageLoader /> : (
        <div style={{ opacity: log.isPlaceholderData ? 0.6 : 1 }}>
          {/* Phones: one entry per block, so what changed is readable without scrolling sideways. */}
          <Stack gap={0} hiddenFrom="sm">
            {log.data.items.map(e => (
              <Stack key={e.id} gap={2} py="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Text size="sm" fw={600}>{auditActionLabel(e.action)}</Text>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.at)}</Text>
                </Group>
                {auditSummary(e, names) && <Text size="sm">{auditSummary(e, names)}</Text>}
                <Text size="xs" c="dimmed">
                  {e.actor.name ?? e.actor.email}
                  {e.tenant && <>　·　<AnchorLink to="/tenants/$tenantId" params={{ tenantId: e.tenant.id }} size="xs">{e.tenant.name}</AnchorLink></>}
                </Text>
              </Stack>
            ))}
          </Stack>
          <Table.ScrollContainer minWidth={760} visibleFrom="sm">
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th w={150}>時間</Table.Th><Table.Th>平台人員</Table.Th><Table.Th>動作</Table.Th><Table.Th>租戶</Table.Th><Table.Th>內容</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {log.data.items.map(e => (
                  <Table.Tr key={e.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.at)}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{e.actor.name ?? e.actor.email}</Text>
                      {e.ip && <Text size="xs" c="dimmed" ff="monospace">{e.ip}</Text>}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{auditActionLabel(e.action)}</Table.Td>
                    <Table.Td>
                      {e.tenant ? (
                        <>
                          <AnchorLink to="/tenants/$tenantId" params={{ tenantId: e.tenant.id }} size="sm">{e.tenant.name}</AnchorLink>
                          <Text size="xs" c="dimmed" ff="monospace">{e.tenant.subdomain}</Text>
                        </>
                      ) : <Text size="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td><Text size="sm">{auditSummary(e, names) || '—'}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {log.data.items.length === 0 && (
            <Text c="dimmed" ta="center" py="lg">{filtered ? '沒有符合條件的紀錄。' : '還沒有任何稽核紀錄。'}</Text>
          )}
          {pages > 1 && (
            <Group justify="center" mt="md">
              <Pagination total={pages} value={page + 1} onChange={p => setPage(p - 1)} size="sm" siblings={1} boundaries={1} />
            </Group>
          )}
        </div>
      )}
      <Text size="xs" c="dimmed" mt="md">平台後台的每一次開通、停用、訂閱變更、方案、公告、範本與帳號異動都會記錄下來，日期以台灣時間計。紀錄不含任何租戶員工資料。</Text>
    </Card>
  );
}
