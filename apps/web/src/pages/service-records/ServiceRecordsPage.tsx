import { Button, Card, Group, Modal, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { StatCard } from '@yutis/ui';
import { useState } from 'react';
import { todayIso } from '../../cases';
import { useMe } from '../../session';
import { CardNote } from '../states';
import { deleteRecord, orgQuery, serviceRecordsQuery } from './queries';
import { StatusBadge } from './parts';
import { RecordFormModal, type FormMode } from './RecordFormModal';
import { RecordViewModal, SignLinksModal } from './RecordViewModal';
import {
  companyOfSite, copyForm, countByStatus, departmentOptions, executorsOf, filterRecords, formFromRecord, groupOptions, myCompanies, newForm, readContent,
  serviceProblem, slashDate, signProgress, STATUSES, timeRange, usedValues, type RecordFilter, type ServiceForm, type ServiceRecord, type ServiceStatus, type SignLink,
} from './records';

interface Editing { key: number; mode: FormMode; recordId?: string; executorName?: string | null; form: ServiceForm }
/** The filters as picked; `department` is the value of a department option. */
type Filter = Omit<RecordFilter, 'companySites' | 'department'> & { company?: string; department?: string };

/** 勞工健康服務執行紀錄表（附表八）: on-site service records of my sites and their sign-off. */
export function ServiceRecordsPage() {
  const me = useMe();
  const { data: records } = useSuspenseQuery(serviceRecordsQuery);
  // Names for the company and department filters; the list works without them.
  const org = useQuery(orgQuery);
  const [filter, setFilter] = useState<Filter>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ServiceRecord | null>(null);
  const [links, setLinks] = useState<{ title: string; links: SignLink[] } | null>(null);
  const sites = [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
  const companies = myCompanies(org.data ?? []);
  const company = companies.find(c => c.id === filter.company);
  const companySites = sites.filter(s => !company || company.siteIds.includes(s.id));
  // The organisation's departments in scope, by site, then other names written on older records.
  const scope = filter.siteId ? [filter.siteId] : company?.siteIds;
  const departments = departmentOptions(org.data ?? [], records, scope);
  const department = departments.find(d => d.value === filter.department)?.match;
  const executors = executorsOf(records);
  const counts = countByStatus(records);
  const rows = filterRecords(records, { ...filter, companySites: company?.siteIds, department });
  const viewing = viewingId ? records.find(r => r.id === viewingId) : undefined;
  const filtered = !!(filter.status || filter.company || filter.siteId || filter.department || filter.executor || filter.from || filter.to);
  const waiting = records.filter(r => r.status === '簽核中').reduce((n, r) => n + r.signatures.filter(s => !s.signedAt).length, 0);
  const patch = (p: Partial<Filter>) => setFilter(f => ({ ...f, ...p }));

  const edit = (mode: FormMode, form: ServiceForm, recordId?: string, executorName?: string | null) => {
    setViewingId(null);
    setEditing({ key: Date.now(), mode, form, recordId, executorName });
  };
  const open = (r: ServiceRecord) => (r.status === '草稿' ? edit('edit', formFromRecord(r, org.data), r.id, r.executorName) : setViewingId(r.id));
  const copy = (r: ServiceRecord) => edit('copy', copyForm(r, todayIso(), me.id, org.data));
  const create = () => {
    const siteId = sites[0]?.id ?? '';
    edit('new', newForm({ today: todayIso(), siteId, me, unit: org.data ? companyOfSite(org.data, siteId)?.name : undefined }));
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>勞工健康服務執行紀錄表</Title>
        <Button leftSection={<IconPlus size={16} />} disabled={!sites.length} onClick={create}>新增紀錄</Button>
      </Group>

      <Card>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          <StatCard tone="lavender" label="草稿" value={counts['草稿']} note="尚未送出簽核" />
          <StatCard tone="blue" label="簽核中" value={counts['簽核中']} note={waiting ? `${waiting} 位尚未簽核` : '等待簽核'} />
          <StatCard tone="mint" label="已完成" value={counts['已完成']} note="全部簽核完成" />
        </SimpleGrid>
      </Card>

      <Card>
        <Stack gap="sm" mb="md">
          <SegmentedControl size="xs" aria-label="紀錄狀態" value={filter.status ?? 'all'} style={{ alignSelf: 'flex-start' }}
            onChange={v => patch({ status: v === 'all' ? undefined : (v as ServiceStatus) })}
            data={[{ value: 'all', label: '全部' }, ...STATUSES.map(s => ({ value: s, label: s }))]} />
          <Group gap="sm" align="flex-end">
            {companies.length > 1 && (
              <Select aria-label="公司" placeholder="全部公司" clearable size="xs" w={180} value={filter.company ?? null}
                data={companies.map(c => ({ value: c.id, label: c.name }))}
                // A site or department of another company no longer matches anything: drop it with the company.
                onChange={v => patch({ company: v ?? undefined, siteId: undefined, department: undefined })} />
            )}
            {companySites.length > 1 && (
              <Select aria-label="地點" placeholder="全部地點" clearable size="xs" w={140} value={filter.siteId ?? null}
                data={companySites.map(s => ({ value: s.id, label: s.name }))} onChange={v => patch({ siteId: v ?? undefined, department: undefined })} />
            )}
            {departments.length > 0 && (
              <Select aria-label="部門" placeholder="全部部門" clearable searchable size="xs" w={150} value={department ? filter.department! : null}
                data={groupOptions(departments)} onChange={v => patch({ department: v ?? undefined })} comboboxProps={{ width: 220, position: 'bottom-start' }} />
            )}
            {executors.length > 1 && (
              <Select aria-label="執行人員" placeholder="全部執行人員" clearable size="xs" w={150} value={filter.executor ?? null}
                data={executors} onChange={v => patch({ executor: v ?? undefined })} />
            )}
            <Group gap={6} wrap="nowrap" align="center">
              <TextInput type="date" size="xs" aria-label="執行日期起" value={filter.from ?? ''} onChange={e => { const v = e.currentTarget.value; patch({ from: v || undefined }); }} />
              <Text size="xs" c="dimmed">～</Text>
              <TextInput type="date" size="xs" aria-label="執行日期迄" value={filter.to ?? ''} onChange={e => { const v = e.currentTarget.value; patch({ to: v || undefined }); }} />
            </Group>
            {filtered && <Button size="xs" variant="subtle" color="gray" onClick={() => setFilter({})}>清除條件</Button>}
          </Group>
        </Stack>

        <Table.ScrollContainer minWidth={920}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>執行日期</Table.Th><Table.Th>執行時間</Table.Th><Table.Th>地點</Table.Th><Table.Th>部門名稱</Table.Th><Table.Th>執行人員</Table.Th><Table.Th>狀態</Table.Th><Table.Th>簽核</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(r => {
                const c = readContent(r.content);
                const p = signProgress(r.signatures);
                return (
                  <Table.Tr key={r.id} onClick={() => open(r)} style={{ cursor: 'pointer' }}>
                    <Table.Td fw={600}>{slashDate(r.serviceOn)}</Table.Td>
                    <Table.Td ff="monospace" fz="sm">{timeRange(c)}</Table.Td>
                    <Table.Td>{r.siteName}</Table.Td>
                    <Table.Td>{c.departmentName || '—'}</Table.Td>
                    <Table.Td>{r.executorName ?? <Text span c="dimmed" size="sm">已刪除的帳號</Text>}</Table.Td>
                    <Table.Td><StatusBadge status={r.status} /></Table.Td>
                    <Table.Td><Text size="sm" c={r.status === '草稿' ? 'dimmed' : undefined}>{p.total ? `${p.signed}／${p.total} 已簽核` : '未設定'}</Text></Table.Td>
                    <Table.Td onClick={e => e.stopPropagation()}>
                      <Group gap={6} justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="default" onClick={() => open(r)}>{r.status === '草稿' ? '編輯' : '檢視'}</Button>
                        <Button size="xs" variant="subtle" color="gray" onClick={() => copy(r)} title="以這筆紀錄為範本建立新紀錄">複製</Button>
                        {r.status === '草稿' && <Button size="xs" variant="subtle" color="red" onClick={() => setDeleting(r)}>刪除</Button>}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && <CardNote>{filtered ? '沒有符合條件的紀錄。' : sites.length ? '還沒有勞工健康服務執行紀錄，按「新增紀錄」開始填寫。' : '尚未指派負責廠區，請洽租戶管理員。'}</CardNote>}
      </Card>

      {editing && (
        <RecordFormModal key={editing.key} mode={editing.mode} recordId={editing.recordId} initial={editing.form} executorName={editing.executorName}
          categorySuggestions={usedValues(records, r => readContent(r.content).special.map(s => s.category))}
          onClose={() => setEditing(null)}
          onSubmitted={l => { setEditing(null); setLinks({ title: '已送出簽核', links: l }); }} />
      )}
      {viewing && (
        <RecordViewModal record={viewing} onClose={() => setViewingId(null)} onCopy={() => copy(viewing)}
          onResent={l => setLinks({ title: l.every(x => x.emailed) ? '已重寄簽核連結' : '已產生新的簽核連結', links: l })} />
      )}
      {deleting && <DeleteDraftModal record={deleting} onClose={() => setDeleting(null)} />}
      {links && <SignLinksModal title={links.title} links={links.links} onClose={() => setLinks(null)} />}
    </Stack>
  );
}

/** A draft can be deleted once confirmed; records sent for sign-off stay (the API refuses them). */
function DeleteDraftModal({ record, onClose }: { record: ServiceRecord; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteRecord(record.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: serviceRecordsQuery.queryKey }); onClose(); },
  });
  const dept = readContent(record.content).departmentName;
  return (
    <Modal opened onClose={onClose} title="刪除草稿" size="sm">
      <Stack gap="md">
        <Text size="sm">確定要刪除 {slashDate(record.serviceOn)} {record.siteName}{dept ? ` · ${dept}` : ''} 的草稿嗎？刪除後無法復原。</Text>
        {remove.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{serviceProblem(remove.error)}</Text>}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={remove.isPending}>取消</Button>
          <Button color="red" loading={remove.isPending} onClick={() => remove.mutate()}>刪除</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
