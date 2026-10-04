import { Anchor, Button, Card, Group, Pagination, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import type { DataCategory } from '@yutis/api-client';
import { useState, type FormEvent } from 'react';
import { staffSelectProps } from '../nurse/StaffPicker';
import { CardNote, problemText } from '../states';
import {
  ACTION_LABEL, ACTION_TONE, actorText, appliedEmployeeLabel, CATEGORY_HINT, CATEGORY_LABEL, dateRangeProblem, EMPLOYEE_STATUS_TONE, employeeLabel,
  formatAt, pageCount, sameFilters, subjectText, type AuditAction, type AuditEntry, type AuditSearch, type EmployeeStatus,
} from './audit';
import { adminEmployeesByIdQuery, adminEmployeesQuery, auditQuery, staffAccountsQuery } from './queries';
import { AdminTitle, ToneBadge } from './ui';

/** An employee picked for the filter, with the words shown for them. */
interface PickedEmployee { id: string; label: string }

/** The filters being edited; they apply when the admin presses 查詢 (each search is itself audited). */
interface FilterForm { employee: PickedEmployee | null; actor: string | null; action: AuditAction | null; category: DataCategory | null; from: string; to: string }

const toForm = (s: AuditSearch, employeeLabel: string | null): FilterForm => ({
  // No label yet: the employee of a shared link is still being looked up.
  employee: s.employee ? { id: s.employee, label: employeeLabel ?? '載入中…' } : null,
  actor: s.actor ?? null, action: s.action ?? null, category: s.category ?? null, from: s.from ?? '', to: s.to ?? '',
});
const fromForm = (f: FilterForm): AuditSearch => ({
  ...(f.employee && { employee: f.employee.id }), ...(f.actor && { actor: f.actor }), ...(f.action && { action: f.action }),
  ...(f.category && { category: f.category }), ...(f.from && { from: f.from }), ...(f.to && { to: f.to }),
});

const ACTION_OPTIONS = (Object.keys(ACTION_LABEL) as AuditAction[]).map(a => ({ value: a, label: ACTION_LABEL[a] }));
const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as DataCategory[]).map(c => ({ value: c, label: CATEGORY_LABEL[c] }));

/** 稽核查詢: who read, changed or exported what, and whose data it was. Read-only. */
export function AuditPage({ search, onSearch }: { search: AuditSearch; onSearch: (next: AuditSearch) => void }) {
  const qc = useQueryClient();
  const list = useQuery(auditQuery(search));
  // Names of employees picked in the filter or from the results, for the filter label (the URL only holds the id).
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const remember = (e: PickedEmployee) => setEmployeeNames(names => ({ ...names, [e.id]: e.label }));

  // A search, a click in the results or a page turn always gets fresh results; going back in history shows what was found.
  const run = (next: AuditSearch) => {
    if (sameFilters(next, search) && (next.page ?? 1) === (search.page ?? 1)) { void list.refetch(); return; }
    qc.removeQueries({ queryKey: auditQuery(next).queryKey, exact: true });
    onSearch(next);
  };
  const byEmployee = (e: NonNullable<AuditEntry['employee']>) => {
    remember({ id: e.id, label: employeeLabel(e) });
    run({ ...search, employee: e.id, page: undefined });
  };
  const picked = search.employee;
  const known = picked ? employeeNames[picked] : undefined;
  // Opened from a link or reloaded: the URL holds only the id, so look the employee up (once; it is audited too).
  const lookup = useQuery(adminEmployeesByIdQuery(picked && !known ? [picked] : []));
  const pickedEntry = list.data?.items.find(i => i.employee?.id === picked)?.employee ?? undefined;
  const pickedLabel = picked ? appliedEmployeeLabel(picked, { known, lookup, inResults: pickedEntry }) : null;

  return (
    <Stack gap="lg">
      <AdminTitle title="稽核查詢"
        description="查詢誰在什麼時候讀取、修改或匯出了哪些資料，例如某位員工的資料被哪些人看過。日期以台灣時間計，含起訖兩天。每次查詢本身也會記入稽核紀錄。" />

      {/* Keyed by the applied filters: after a search, a click in the results or going back, the form shows what is applied. */}
      <AuditFilters key={filtersKey(search)} search={search} employeeLabel={pickedLabel} searching={list.isFetching} onRun={run} onPickEmployee={remember} />

      <Card>
        {list.isPending ? <Skeleton h={360} /> : list.isError ? <CardNote>{problemText(list.error)}</CardNote> : (
          <>
            <Table.ScrollContainer minWidth={1080}>
              <Table verticalSpacing="sm" highlightOnHover style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={170}>時間</Table.Th><Table.Th>操作者</Table.Th><Table.Th w={100}>動作</Table.Th><Table.Th>資料</Table.Th>
                    <Table.Th>員工</Table.Th><Table.Th w={110}>資料等級</Table.Th><Table.Th>說明</Table.Th><Table.Th w={120}>IP</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.data.items.map(e => (
                    <AuditRow key={e.id} entry={e} search={search} onEmployee={byEmployee} onActor={id => run({ ...search, actor: id, page: undefined })} />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {list.data.items.length === 0 && <CardNote>沒有符合條件的紀錄。</CardNote>}
            {list.data.total > 0 && (
              <Group justify="space-between" mt="md" gap="sm">
                <Text size="sm" c="dimmed">共 {list.data.total.toLocaleString()} 筆，新的在前</Text>
                {pageCount(list.data.total) > 1 && (
                  <Pagination total={pageCount(list.data.total)} value={search.page ?? 1} size="sm" siblings={1}
                    onChange={p => run({ ...search, page: p > 1 ? p : undefined })} />
                )}
              </Group>
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}

const filtersKey = (s: AuditSearch) => JSON.stringify([s.employee, s.actor, s.action, s.category, s.from, s.to]);

function AuditFilters({ search, employeeLabel, searching, onRun, onPickEmployee }: {
  search: AuditSearch; employeeLabel: string | null; searching: boolean; onRun: (next: AuditSearch) => void; onPickEmployee: (e: PickedEmployee) => void;
}) {
  const { data: accounts } = useSuspenseQuery(staffAccountsQuery);
  const [form, setForm] = useState<FilterForm>(() => toForm(search, employeeLabel));
  const dateProblem = dateRangeProblem(form.from, form.to);
  const actorOptions = accounts.map(a => ({ value: a.id, label: `${a.name}（${a.role}${a.active ? '' : '，已停用'}）`, email: a.email }));
  // The applied employee's name may arrive after the form opened (from the results of a shared link).
  const employee = form.employee && form.employee.id === search.employee && employeeLabel ? { ...form.employee, label: employeeLabel } : form.employee;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dateProblem) onRun(fromForm(form));
  };
  // Only searches again when filters were applied.
  const clear = () => { setForm(toForm({}, null)); if (filtersKey(search) !== filtersKey({})) onRun({}); };

  return (
    <Card>
      <form onSubmit={submit}>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          <EmployeeField key={employee?.label ?? ''} value={employee}
            onChange={e => { if (e) onPickEmployee(e); setForm(f => ({ ...f, employee: e })); }} />
          <Select label="操作者" placeholder="全部人員" clearable searchable data={actorOptions} value={form.actor} onChange={v => setForm(f => ({ ...f, actor: v }))} {...staffSelectProps}
            nothingFoundMessage="找不到這位人員" />
          <Select label="動作" placeholder="全部動作" clearable data={ACTION_OPTIONS} value={form.action} onChange={v => setForm({ ...form, action: v as AuditAction | null })} />
          <Select label="資料等級" placeholder="全部等級" clearable data={CATEGORY_OPTIONS} value={form.category}
            onChange={v => setForm({ ...form, category: v as DataCategory | null })}
            renderOption={({ option }) => (
              <Stack gap={0}><Text size="sm">{option.label}</Text><Text size="xs" c="dimmed">{CATEGORY_HINT[option.value as DataCategory]}</Text></Stack>
            )} />
          <TextInput label="開始日期" type="date" value={form.from} onChange={e => setForm({ ...form, from: e.currentTarget.value })} />
          <TextInput label="結束日期" type="date" value={form.to} onChange={e => setForm({ ...form, to: e.currentTarget.value })} error={dateProblem} />
        </SimpleGrid>
        <Group justify="space-between" gap="sm" mt="md" wrap="wrap">
          <Text size="sm" c="dimmed">選擇員工，或點表格中的員工，可只看這位員工的資料被誰存取。</Text>
          <Group gap="sm" ml="auto">
            <Button variant="default" onClick={clear}>清除條件</Button>
            <Button type="submit" leftSection={<IconSearch size={16} />} loading={searching} disabled={!!dateProblem}>查詢</Button>
          </Group>
        </Group>
      </form>
    </Card>
  );
}

interface EmployeeOption { value: string; label: string; empNo?: string; name?: string; status?: EmployeeStatus }

/**
 * Employee filter: type 工號 or a name and pick from GET /api/admin/employees (leavers and people on leave included,
 * marked). Searches wait for a pause in typing, since every employee the search returns is itself written to the audit log.
 */
function EmployeeField({ value, onChange }: { value: PickedEmployee | null; onChange: (e: PickedEmployee | null) => void }) {
  const [search, setSearch] = useState(value?.label ?? '');
  const term = value && search === value.label ? '' : search.trim();
  const [debounced] = useDebouncedValue(term, 350);
  const found = useQuery(adminEmployeesQuery(debounced));
  const results = found.data ?? [];
  // The picked employee keeps its label (the input shows it); among the results it also shows its status.
  const options: EmployeeOption[] = [
    ...(value && !results.some(e => e.id === value.id) ? [{ value: value.id, label: value.label }] : []),
    ...results.map(e => ({ value: e.id, label: e.id === value?.id ? value.label : employeeLabel(e), empNo: e.empNo, name: e.name, status: e.status })),
  ];
  return (
    <Select label="員工" placeholder="輸入工號或姓名" searchable clearable searchValue={search} onSearchChange={setSearch}
      data={options} value={value?.id ?? null} filter={({ options: o }) => o}
      onChange={id => { const o = options.find(x => x.value === id); onChange(o ? { id: o.value, label: o.label } : null); }}
      renderOption={({ option }) => {
        const o = option as EmployeeOption;
        if (!o.empNo) return <Text size="sm">{o.label}</Text>;
        return (
          <Group gap="xs" wrap="nowrap" justify="space-between" w="100%">
            <Text size="sm" truncate><Text span ff="monospace" size="sm">{o.empNo}</Text> {o.name}</Text>
            {o.status && (o.status === '在職' ? <Text size="xs" c="dimmed">在職</Text> : <StatusMark status={o.status} />)}
          </Group>
        );
      }}
      nothingFoundMessage={!debounced ? '輸入工號或姓名（含留停、離職員工）' : found.isFetching ? '搜尋中…' : found.isError ? problemText(found.error) : '找不到符合的員工'} />
  );
}

/** 留停 or 離職, as the employee list colours them (在職 is not marked). */
const StatusMark = ({ status }: { status: EmployeeStatus }) => <ToneBadge tone={EMPLOYEE_STATUS_TONE[status]}>{status}</ToneBadge>;

function AuditRow({ entry: e, search, onEmployee, onActor }: {
  entry: AuditEntry; search: AuditSearch; onEmployee: (emp: NonNullable<AuditEntry['employee']>) => void; onActor: (id: string) => void;
}) {
  const actor = actorText(e.actor);
  const subject = subjectText(e.subjectTable);
  const actorId = e.actor.kind === 'staff' ? e.actor.id : null;
  return (
    <Table.Tr>
      <Table.Td fz="sm" ff="monospace" style={{ whiteSpace: 'nowrap' }}>{formatAt(e.at)}</Table.Td>
      <Table.Td>
        <Stack gap={0}>
          {actorId && actorId !== search.actor
            ? <Anchor component="button" type="button" size="sm" fw={600} ta="left" onClick={() => onActor(actorId)} aria-label={`只看 ${actor.name} 的操作`}>{actor.name}</Anchor>
            : <Text size="sm" fw={600}>{actor.name}</Text>}
          {actor.note && <Text size="xs" c="dimmed">{actor.note}</Text>}
        </Stack>
      </Table.Td>
      <Table.Td><ToneBadge tone={ACTION_TONE[e.action]}>{ACTION_LABEL[e.action]}</ToneBadge></Table.Td>
      <Table.Td fz="sm" c={subject ? undefined : 'dimmed'}>{subject ?? '—'}</Table.Td>
      <Table.Td fz="sm" style={{ whiteSpace: 'nowrap' }}>
        {e.employee ? (
          <Group gap={6} wrap="nowrap">
            {e.employee.id === search.employee
              ? <Text size="sm"><Text span ff="monospace" size="sm">{e.employee.empNo}</Text> {e.employee.name}</Text>
              : (
                <Anchor component="button" type="button" size="sm" ta="left" onClick={() => onEmployee(e.employee!)} aria-label={`只看 ${e.employee.name} 的資料`}>
                  <Text span ff="monospace" size="sm">{e.employee.empNo}</Text> {e.employee.name}
                </Anchor>
              )}
            {e.employee.status !== '在職' && <StatusMark status={e.employee.status} />}
          </Group>
        ) : <Text size="sm" c="dimmed">—</Text>}
      </Table.Td>
      <Table.Td fz="sm" c={e.dataCategory ? undefined : 'dimmed'}>{e.dataCategory ? CATEGORY_LABEL[e.dataCategory] : '—'}</Table.Td>
      <Table.Td fz="xs" c="dimmed" maw={280} style={{ wordBreak: 'break-word' }}>{e.reason ?? '—'}</Table.Td>
      <Table.Td fz="xs" ff="monospace" c={e.ip ? undefined : 'dimmed'}>{e.ip ?? '—'}</Table.Td>
    </Table.Tr>
  );
}
