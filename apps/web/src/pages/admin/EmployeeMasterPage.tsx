import { Button, Card, Checkbox, Group, Modal, Pagination, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFileImport, IconSearch, IconUserPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { AnchorLink } from '../../links';
import { CardNote } from '../states';
import {
  createEmployeeBody, EMPLOYEE_STATUSES, emptyEmployeeForm, employeeFormProblems, employeeToForm, LANG_OPTIONS, updateEmployeeBody,
  type EmployeeForm, type EmployeeRecord, type EmployeeStatus,
} from './employeeMaster';
import { flattenDepartments, flattenSites, siteOptions, type LegalEntity } from './org';
import { EMPLOYEE_PAGE_SIZE, employeeRecordsQuery, orgQuery } from './queries';
import { AdminTitle, ErrorNote, FormActions, ToneBadge } from './ui';

const STATUS_TONE = { 在職: 'ok', 留停: 'warn', 離職: 'muted' } as const;
const ERRORS = { unknown_site: '這個廠區已不存在，請重新整理後再選一次。' };

/** 員工主檔: every employee of the tenant; add or change one at a time (Excel import is for many at once). */
export function EmployeeMasterPage() {
  const { data: tree } = useSuspenseQuery(orgQuery);
  const [q, setQ] = useState('');
  const [debouncedQ] = useDebouncedValue(q.trim(), 300);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [status, setStatus] = useState<EmployeeStatus | 'all'>('在職');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EmployeeRecord | 'new' | null>(null);
  const list = useQuery(employeeRecordsQuery({ q: debouncedQ, siteId, status: status === 'all' ? null : status, page }));
  const sites = new Map(flattenSites(tree).map(s => [s.id, s.name]));
  const depts = new Map(flattenDepartments(tree).map(d => [d.id, d.name]));
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / EMPLOYEE_PAGE_SIZE));
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <Stack gap="lg">
      <AdminTitle title="員工主檔"
        description={<>一次新增或修改一位員工。要一次處理很多人，請用<AnchorLink to="/admin/employee-import" size="sm">員工匯入</AnchorLink>。員工不會被刪除，離職請把狀態改成「離職」。</>}
        actions={(
          <Group gap="sm">
            <Button variant="default" leftSection={<IconFileImport size={16} />} component={AnchorLink} to="/admin/employee-import">Excel 匯入</Button>
            <Button leftSection={<IconUserPlus size={16} />} onClick={() => setEditing('new')} disabled={sites.size === 0}>新增員工</Button>
          </Group>
        )} />

      <Card>
        {sites.size === 0 && <CardNote>還沒有廠區。請先到<AnchorLink to="/admin/org" size="sm">組織架構</AnchorLink>建立法人、廠區與部門。</CardNote>}
        <Group gap="sm" mb="md" wrap="wrap">
          <TextInput aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={16} />} w={220} value={q} onChange={e => { setQ(e.currentTarget.value); setPage(1); }} />
          <Select aria-label="廠區" placeholder="全部廠區" clearable w={170} data={siteOptions(tree)} value={siteId} onChange={filter(setSiteId)} />
          <SegmentedControl aria-label="狀態" value={status} onChange={filter(v => setStatus(v as EmployeeStatus | 'all'))}
            data={[...EMPLOYEE_STATUSES.map(s => ({ value: s, label: s })), { value: 'all', label: '全部' }]} />
          <Text size="sm" c="dimmed" ml="auto">共 {list.data?.total ?? '—'} 人</Text>
        </Group>
        <ErrorNote error={list.error} />
        <Table.ScrollContainer minWidth={960}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>工號</Table.Th><Table.Th>姓名</Table.Th><Table.Th>性別</Table.Th><Table.Th>廠區</Table.Th><Table.Th>部門</Table.Th><Table.Th>職稱</Table.Th><Table.Th>Email／手機</Table.Th><Table.Th>狀態</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.isPending && [0, 1, 2].map(i => <Table.Tr key={i}><Table.Td colSpan={9}><Skeleton h={20} /></Table.Td></Table.Tr>)}
              {list.data?.items.map(e => (
                <Table.Tr key={e.id}>
                  <Table.Td ff="monospace" fz="sm">{e.empNo}</Table.Td>
                  <Table.Td><Text fw={600} size="sm">{e.name}</Text></Table.Td>
                  <Table.Td fz="sm">{e.sex}</Table.Td>
                  <Table.Td fz="sm">{sites.get(e.siteId) ?? '—'}</Table.Td>
                  <Table.Td fz="sm">{depts.get(e.departmentId) ?? '—'}</Table.Td>
                  <Table.Td fz="sm" c={e.title ? undefined : 'dimmed'}>{e.title ?? '—'}</Table.Td>
                  <Table.Td fz="sm" c={e.email || e.phone ? undefined : 'dimmed'}>{[e.email, e.phone].filter(Boolean).join('／') || '—'}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}><ToneBadge tone={STATUS_TONE[e.status]}>{e.status}</ToneBadge></Table.Td>
                  <Table.Td><Button size="compact-sm" variant="default" onClick={() => setEditing(e)} aria-label={`編輯 ${e.name}`}>編輯</Button></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.data?.items.length === 0 && <CardNote>沒有符合條件的員工。</CardNote>}
        {pages > 1 && <Group justify="center" mt="md"><Pagination total={pages} value={page} onChange={setPage} size="sm" /></Group>}
      </Card>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? '新增員工' : editing ? `編輯員工 · ${editing.name}` : ''} size="lg">
        {editing && <EmployeeFormView key={editing === 'new' ? 'new' : editing.id} employee={editing === 'new' ? null : editing} tree={tree} onDone={() => setEditing(null)} />}
      </Modal>
    </Stack>
  );
}

function EmployeeFormView({ employee, tree, onDone }: { employee: EmployeeRecord | null; tree: LegalEntity[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<EmployeeForm>(() => (employee ? employeeToForm(employee) : emptyEmployeeForm()));
  const [tried, setTried] = useState(false);
  const problems = employeeFormProblems(f);
  const changes = employee ? updateEmployeeBody(employee, f) : null;
  const departments = flattenDepartments(tree).filter(d => d.site.id === f.siteId).map(d => ({ value: d.id, label: d.name }));
  const save = useMutation({
    mutationFn: async () => {
      if (!employee) return data(api.POST('/api/admin/employees', { body: createEmployeeBody(f) }));
      return data(api.PATCH('/api/admin/employees/{id}', { params: { path: { id: employee.id } }, body: updateEmployeeBody(employee, f) }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'employee-records'] });
      void qc.invalidateQueries({ queryKey: ['employees'] });
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0) save.mutate();
  };
  const show = (k: keyof EmployeeForm) => (tried ? problems[k] : undefined);
  const text = (k: 'empNo' | 'name' | 'birthDate' | 'title' | 'shift' | 'examCategory' | 'specialOperations' | 'hireDate' | 'email' | 'phone' | 'nationalId') =>
    (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="工號" required value={f.empNo} onChange={text('empNo')} maxLength={50} error={show('empNo')} data-autofocus={!employee || undefined} />
          <TextInput label="姓名" required value={f.name} onChange={text('name')} maxLength={100} error={show('name')} />
          <Select label="性別" required data={['男', '女']} value={f.sex || null} onChange={v => setF({ ...f, sex: (v ?? '') as EmployeeForm['sex'] })} error={show('sex')} />
          <TextInput label="出生日期" required type="date" value={f.birthDate} onChange={text('birthDate')} error={show('birthDate')} />
          <Select label="廠區" required data={siteOptions(tree)} value={f.siteId || null} onChange={v => setF({ ...f, siteId: v ?? '', departmentId: '' })} error={show('siteId')} />
          <Select label="部門" required data={departments} value={f.departmentId || null} onChange={v => setF({ ...f, departmentId: v ?? '' })} error={show('departmentId')}
            disabled={!f.siteId} placeholder={f.siteId ? (departments.length ? '選擇部門' : '這個廠區還沒有部門') : '先選廠區'} />
          <TextInput label="職稱" value={f.title} onChange={text('title')} maxLength={100} />
          <TextInput label="班別" value={f.shift} onChange={text('shift')} maxLength={50} />
          <TextInput label="健檢類別" value={f.examCategory} onChange={text('examCategory')} maxLength={50} />
          <TextInput label="到職日" type="date" value={f.hireDate} onChange={text('hireDate')} error={show('hireDate')} />
        </SimpleGrid>
        <TextInput label="特殊作業" value={f.specialOperations} onChange={text('specialOperations')} description="多項以「、」分隔，例如 噪音、游離輻射" />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Email" type="email" value={f.email} onChange={text('email')} maxLength={200} error={show('email')} description="員工登入員工端用" />
          <TextInput label="手機" value={f.phone} onChange={text('phone')} maxLength={40} description="員工登入員工端用" />
          <Select label="員工端語言" data={LANG_OPTIONS} value={f.lang} onChange={v => v && setF({ ...f, lang: v })} allowDeselect={false} />
          <Select label="狀態" data={[...EMPLOYEE_STATUSES]} value={f.status} onChange={v => v && setF({ ...f, status: v as EmployeeStatus })} allowDeselect={false} />
        </SimpleGrid>
        <TextInput label="身分證字號" value={f.nationalId} onChange={text('nationalId')} maxLength={10} error={show('nationalId')} disabled={f.clearNationalId}
          placeholder={employee?.nationalIdMasked ? `目前為 ${employee.nationalIdMasked}，要更換才填` : undefined}
          description="系統只保存遮罩與比對健檢檔用的指紋，不保存完整號碼。" />
        {employee?.nationalIdMasked && (
          <Checkbox label="移除身分證字號" checked={f.clearNationalId} onChange={e => setF({ ...f, clearNationalId: e.currentTarget.checked, nationalId: '' })} />
        )}
        <ErrorNote error={save.error} overrides={ERRORS} />
        <FormActions busy={save.isPending} onCancel={onDone} submitLabel={employee ? '儲存' : '新增'} disabled={!!changes && Object.keys(changes).length === 0} />
      </Stack>
    </form>
  );
}
