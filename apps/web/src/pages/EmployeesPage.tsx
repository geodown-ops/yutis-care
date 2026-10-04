import { Badge, Card, Group, Pagination, Select, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { ageAt } from '@yutis/domain';
import { useState } from 'react';
import { todayIso } from '../cases';
import { AnchorLink } from '../links';
import { employeesQuery, EMPLOYEES_PAGE_SIZE } from '../queries';
import type { EmployeesSearch } from '../routes/_app/employees.index';
import { useMe } from '../session';
import { CardNote, problemText } from './states';

/** Employees of my sites (or sites with active break-glass access), searchable by name or employee number. */
export function EmployeesPage({ search, onSearch }: { search: EmployeesSearch; onSearch: (next: EmployeesSearch) => void }) {
  const me = useMe();
  const sites = [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
  const [q, setQ] = useState(search.q ?? '');
  const pushQ = useDebouncedCallback((v: string) => onSearch({ ...search, q: v || undefined, page: undefined }), 300);
  const list = useQuery(employeesQuery({ q: search.q, siteId: search.site, page: search.page }));
  const today = todayIso();
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / EMPLOYEES_PAGE_SIZE)) : 1;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>員工資料</Title>
        <Group gap="sm">
          {sites.length > 1 && (
            <Select aria-label="廠區" placeholder="全部廠區" clearable w={160} value={search.site ?? null}
              data={sites.map(s => ({ value: s.id, label: s.name }))} onChange={v => onSearch({ ...search, site: v ?? undefined, page: undefined })} />
          )}
          <TextInput aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={16} />} w={240}
            value={q} onChange={e => { setQ(e.currentTarget.value); pushQ(e.currentTarget.value.trim()); }} />
        </Group>
      </Group>
      <Card>
        {list.isPending ? <Skeleton h={320} /> : list.isError ? <CardNote>{problemText(list.error)}</CardNote> : (
          <>
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" highlightOnHover style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
                <Table.Thead>
                  <Table.Tr><Table.Th>工號</Table.Th><Table.Th>姓名</Table.Th><Table.Th>廠區</Table.Th><Table.Th>部門</Table.Th><Table.Th>職稱</Table.Th><Table.Th>班別</Table.Th><Table.Th ta="right">年齡</Table.Th><Table.Th>狀態</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.data.items.map(e => (
                    <Table.Tr key={e.id}>
                      <Table.Td ff="monospace" fz="sm">{e.empNo}</Table.Td>
                      <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: e.id }} fw={600}>{e.name}</AnchorLink></Table.Td>
                      <Table.Td>{e.site.name}</Table.Td>
                      <Table.Td>{e.department.name}</Table.Td>
                      <Table.Td>{e.title ?? '—'}</Table.Td>
                      <Table.Td>{e.shift ?? '—'}</Table.Td>
                      <Table.Td ta="right">{ageAt(e.birthDate, today)}</Table.Td>
                      <Table.Td><EmployeeStatus status={e.status} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {list.data.items.length === 0 && <CardNote>{search.q ? `找不到「${search.q}」，請確認姓名或工號。` : '負責廠區目前沒有員工資料。'}</CardNote>}
            {list.data.total > 0 && (
              <Group justify="space-between" mt="md">
                <Text size="sm" c="dimmed">共 {list.data.total} 人</Text>
                {pages > 1 && <Pagination total={pages} value={search.page ?? 1} onChange={p => onSearch({ ...search, page: p > 1 ? p : undefined })} size="sm" />}
              </Group>
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}

export function EmployeeStatus({ status }: { status: '在職' | '留停' | '離職' }) {
  const tone = status === '在職' ? 'ok' : status === '留停' ? 'warn' : 'bad';
  return <Badge styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none' } }}>{status}</Badge>;
}
