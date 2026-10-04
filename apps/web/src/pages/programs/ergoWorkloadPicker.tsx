/* Choose the employees a questionnaire goes to (人因 NMQ and 過勞量表 dispatches). Current employees of my sites only. */
import { Badge, Button, Checkbox, Group, Pagination, Select, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { useMe } from '../../session';
import { CardNote, problemText } from '../states';

const PAGE = 50;
/** The directory's largest page; used when selecting everyone who matches. */
const ALL_PAGE = 200;

interface Filter { q?: string; siteId?: string }
const pickQuery = ({ q, siteId }: Filter, page: number) => queryOptions({
  queryKey: ['employees', 'pick', { q, siteId, page }],
  queryFn: () => data(api.GET('/api/employees', { params: { query: { q, siteId, status: '在職', limit: PAGE, offset: (page - 1) * PAGE } } })),
  placeholderData: keepPreviousData,
});

async function allIds({ q, siteId }: Filter): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += ALL_PAGE) {
    const res = await data(api.GET('/api/employees', { params: { query: { q, siteId, status: '在職', limit: ALL_PAGE, offset } } }));
    ids.push(...res.items.map(e => e.id));
    if (offset + ALL_PAGE >= res.total) return ids;
  }
}

/**
 * `blocked` maps an employee to the reason they cannot be chosen (e.g. an assessment still open).
 * The API also refuses anyone outside my sites.
 */
export function EmployeePicker({ selected, onChange, blocked }: {
  selected: ReadonlySet<string>; onChange: (next: Set<string>) => void; blocked?: ReadonlyMap<string, string>;
}) {
  const me = useMe();
  const sites = [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
  const [siteId, setSiteId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q.trim(), 300);
  const [page, setPage] = useState(1);
  const filter: Filter = { q: debounced || undefined, siteId: siteId ?? undefined };
  const list = useQuery(pickQuery(filter, page));
  const [addingAll, setAddingAll] = useState(false);
  const [allError, setAllError] = useState<unknown>(null);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE)) : 1;
  const choosable = (list.data?.items ?? []).filter(e => !blocked?.has(e.id));
  const pageAll = choosable.length > 0 && choosable.every(e => selected.has(e.id));
  const pageSome = choosable.some(e => selected.has(e.id));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };
  const togglePage = (on: boolean) => {
    const next = new Set(selected);
    for (const e of choosable) if (on) next.add(e.id); else next.delete(e.id);
    onChange(next);
  };
  const addAll = async () => {
    setAddingAll(true);
    setAllError(null);
    try {
      const next = new Set(selected);
      for (const id of await allIds(filter)) if (!blocked?.has(id)) next.add(id);
      onChange(next);
    } catch (err) {
      setAllError(err);
    } finally {
      setAddingAll(false);
    }
  };

  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="wrap">
        {sites.length > 1 && (
          <Select aria-label="廠區" placeholder="全部廠區" clearable w={160} value={siteId}
            data={sites.map(s => ({ value: s.id, label: s.name }))} onChange={v => { setSiteId(v); setPage(1); }} />
        )}
        <TextInput aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={16} />} style={{ flex: 1, minWidth: 180 }}
          value={q} onChange={e => { setQ(e.currentTarget.value); setPage(1); }} />
      </Group>
      <Group justify="space-between" gap="xs">
        <Text size="sm">已選 <b>{selected.size}</b> 人</Text>
        <Group gap="xs">
          {list.data && list.data.total > 0 && (
            <Button size="xs" variant="default" loading={addingAll} onClick={() => void addAll()}>選取符合條件的 {list.data.total} 人</Button>
          )}
          {selected.size > 0 && <Button size="xs" variant="subtle" onClick={() => onChange(new Set())}>清除</Button>}
        </Group>
      </Group>
      {allError != null && <Text size="xs" c="var(--yutis-bad)">{problemText(allError)}</Text>}
      {list.isPending ? <Skeleton h={240} /> : list.isError ? <CardNote>{problemText(list.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={520} mah={360}>
            <Table verticalSpacing={6} highlightOnHover stickyHeader style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}><Checkbox aria-label="選取本頁" checked={pageAll} indeterminate={!pageAll && pageSome} disabled={!choosable.length} onChange={e => togglePage(e.currentTarget.checked)} /></Table.Th>
                  <Table.Th>工號</Table.Th><Table.Th>姓名</Table.Th><Table.Th>廠區</Table.Th><Table.Th>部門</Table.Th><Table.Th>職稱</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.data.items.map(e => {
                  const reason = blocked?.get(e.id);
                  return (
                    <Table.Tr key={e.id}>
                      <Table.Td><Checkbox aria-label={`選取 ${e.name}`} checked={selected.has(e.id)} disabled={!!reason} onChange={ev => toggle(e.id, ev.currentTarget.checked)} /></Table.Td>
                      <Table.Td ff="monospace" fz="sm">{e.empNo}</Table.Td>
                      <Table.Td>{e.name}{reason && <Badge ml={6} size="sm" styles={{ root: { background: 'var(--yutis-warn-weak)', color: 'var(--yutis-warn)', textTransform: 'none' } }}>{reason}</Badge>}</Table.Td>
                      <Table.Td>{e.site.name}</Table.Td>
                      <Table.Td>{e.department.name}</Table.Td>
                      <Table.Td>{e.title ?? '—'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {list.data.items.length === 0 && <CardNote>{debounced ? `找不到「${debounced}」。` : '負責廠區目前沒有在職員工。'}</CardNote>}
          {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
        </>
      )}
    </Stack>
  );
}
