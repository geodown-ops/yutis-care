import { Button, Card, Group, Modal, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconFileImport, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { StatCard } from '@yutis/ui';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { CardNote } from '../states';
import { changes, type OrgImportReport } from './imports';
import { ImportFlow } from './ImportFlow';
import { flattenDepartments, flattenSites, siteOptions, type DepartmentRow, type LegalEntity, type SiteRow } from './org';
import { downloadOrgTemplate, importOrg, orgQuery } from './queries';
import { AdminTitle, ConfirmModal, DownloadButton, ErrorNote, FormActions, ToneBadge } from './ui';

type Editing =
  | { kind: 'legal-entity'; row?: LegalEntity }
  | { kind: 'site'; row?: SiteRow }
  | { kind: 'department'; row?: DepartmentRow };
type Deleting = { kind: Editing['kind']; id: string; name: string };

const KIND_LABEL: Record<Editing['kind'], string> = { 'legal-entity': '法人', site: '廠區', department: '部門' };
const DUPLICATE: Record<Editing['kind'], string> = {
  'legal-entity': '這個法人代碼已被使用。', site: '這個廠區代碼已被使用。', department: '這個廠區已有同名的部門，或部門代碼已被使用。',
};
const IN_USE: Record<Editing['kind'], string> = {
  'legal-entity': '這個法人底下還有廠區或員工，不能刪除。', site: '這個廠區還有部門、員工或負責人員，不能刪除。', department: '這個部門還有員工，不能刪除。',
};
const dash = (v: string | null | undefined) => v || '—';

/** 組織架構: legal entities → sites → departments. Employees, staff site scope and imports refer to these codes. */
export function OrgPage() {
  const { data: tree } = useSuspenseQuery(orgQuery);
  const sites = flattenSites(tree);
  const departments = flattenDepartments(tree);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [importing, setImporting] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const shownDepartments = siteFilter ? departments.filter(d => d.site.id === siteFilter) : departments;

  return (
    <Stack gap="lg">
      <AdminTitle title="組織架構" description="法人 → 廠區 → 部門。員工匯入、人員的負責廠區與各項匯入都以這裡的代碼對照。"
        actions={<Button leftSection={<IconFileImport size={16} />} variant="default" onClick={() => setImporting(true)}>以 Excel 匯入</Button>} />

      <Card>
        <SimpleGrid cols={{ base: 3 }} spacing="sm">
          <StatCard tone="lavender" label="法人" value={tree.length} />
          <StatCard tone="blue" label="廠區" value={sites.length} />
          <StatCard tone="mint" label="部門" value={departments.length} />
        </SimpleGrid>
      </Card>

      <Card>
        <SectionHead title="法人" onAdd={() => setEditing({ kind: 'legal-entity' })} />
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th w={120}>代碼</Table.Th><Table.Th>法人／公司</Table.Th><Table.Th ta="right" w={90}>廠區數</Table.Th><Table.Th w={150} /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {tree.map(le => (
                <Table.Tr key={le.id}>
                  <Table.Td ff="monospace" fz="sm">{le.code}</Table.Td>
                  <Table.Td fw={600}>{le.name}</Table.Td>
                  <Table.Td ta="right">{le.sites.length}</Table.Td>
                  <Table.Td><RowActions label={le.name} onEdit={() => setEditing({ kind: 'legal-entity', row: le })} onDelete={() => setDeleting({ kind: 'legal-entity', id: le.id, name: le.name })} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {tree.length === 0 && <CardNote>還沒有法人。先新增法人，或以 Excel 匯入整個組織。</CardNote>}
      </Card>

      <Card>
        <SectionHead title="廠區" onAdd={tree.length ? () => setEditing({ kind: 'site' }) : undefined} />
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th w={120}>代碼</Table.Th><Table.Th>廠／院區</Table.Th><Table.Th>法人</Table.Th><Table.Th>地址</Table.Th><Table.Th ta="right" w={90}>部門數</Table.Th><Table.Th w={150} /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {sites.map(s => (
                <Table.Tr key={s.id}>
                  <Table.Td ff="monospace" fz="sm">{s.code}</Table.Td>
                  <Table.Td fw={600}>{s.name}</Table.Td>
                  <Table.Td>{s.legalEntity.name}</Table.Td>
                  <Table.Td c={s.address ? undefined : 'dimmed'}>{dash(s.address)}</Table.Td>
                  <Table.Td ta="right">{s.departments.length}</Table.Td>
                  <Table.Td><RowActions label={s.name} onEdit={() => setEditing({ kind: 'site', row: s })} onDelete={() => setDeleting({ kind: 'site', id: s.id, name: s.name })} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {sites.length === 0 && <CardNote>{tree.length ? '還沒有廠區。' : '請先新增法人，再新增廠區。'}</CardNote>}
      </Card>

      <Card>
        <SectionHead title="部門" onAdd={sites.length ? () => setEditing({ kind: 'department' }) : undefined}>
          {sites.length > 1 && (
            <Select aria-label="篩選廠區" placeholder="全部廠區" clearable w={180} size="xs" value={siteFilter} onChange={setSiteFilter} data={siteOptions(tree)} />
          )}
        </SectionHead>
        <Table.ScrollContainer minWidth={860}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th w={100}>代碼</Table.Th><Table.Th>部門</Table.Th><Table.Th>廠區</Table.Th><Table.Th>主管</Table.Th><Table.Th>主管 Email</Table.Th><Table.Th>主管電話</Table.Th><Table.Th w={150} /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shownDepartments.map(d => (
                <Table.Tr key={d.id}>
                  <Table.Td ff="monospace" fz="sm" c={d.code ? undefined : 'dimmed'}>{dash(d.code)}</Table.Td>
                  <Table.Td fw={600}>{d.name}</Table.Td>
                  <Table.Td>{d.site.name}</Table.Td>
                  <Table.Td c={d.managerName ? undefined : 'dimmed'}>{dash(d.managerName)}</Table.Td>
                  <Table.Td ff={d.managerEmail ? 'monospace' : undefined} fz="sm" c={d.managerEmail ? undefined : 'dimmed'}>{dash(d.managerEmail)}</Table.Td>
                  <Table.Td fz="sm" c={d.managerPhone ? undefined : 'dimmed'}>{dash(d.managerPhone)}</Table.Td>
                  <Table.Td><RowActions label={d.name} onEdit={() => setEditing({ kind: 'department', row: d })} onDelete={() => setDeleting({ kind: 'department', id: d.id, name: d.name })} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {shownDepartments.length === 0 && <CardNote>{sites.length ? '還沒有部門。' : '請先新增廠區，再新增部門。'}</CardNote>}
      </Card>

      <OrgUnitModal editing={editing} tree={tree} onClose={() => setEditing(null)} />
      <DeleteUnit deleting={deleting} onClose={() => setDeleting(null)} />
      <Modal opened={importing} onClose={() => setImporting(false)} title="以 Excel 匯入組織" size="xl">
        <OrgImport />
      </Modal>
    </Stack>
  );
}

function SectionHead({ title, onAdd, children }: { title: string; onAdd?: () => void; children?: React.ReactNode }) {
  return (
    <Group justify="space-between" mb="sm" gap="sm">
      <Text fw={600} size="lg">{title}</Text>
      <Group gap="sm">
        {children}
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAdd} disabled={!onAdd}>新增{title}</Button>
      </Group>
    </Group>
  );
}

function RowActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <Group gap={6} justify="flex-end" wrap="nowrap">
      <Button size="compact-sm" variant="default" onClick={onEdit} aria-label={`編輯 ${label}`}>編輯</Button>
      <Button size="compact-sm" variant="subtle" color="gray" onClick={onDelete} aria-label={`刪除 ${label}`}>刪除</Button>
    </Group>
  );
}

function useInvalidateOrg() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin', 'org'] });
}

interface UnitForm { parentId: string | null; code: string; name: string; address: string; managerName: string; managerEmail: string; managerPhone: string }

function initialForm(e: Editing): UnitForm {
  const blank = { parentId: null, code: '', name: '', address: '', managerName: '', managerEmail: '', managerPhone: '' };
  if (e.kind === 'legal-entity') return { ...blank, code: e.row?.code ?? '', name: e.row?.name ?? '' };
  if (e.kind === 'site') return { ...blank, parentId: e.row?.legalEntity.id ?? null, code: e.row?.code ?? '', name: e.row?.name ?? '', address: e.row?.address ?? '' };
  const d = e.row;
  return { parentId: d?.site.id ?? null, code: d?.code ?? '', name: d?.name ?? '', address: '', managerName: d?.managerName ?? '', managerEmail: d?.managerEmail ?? '', managerPhone: d?.managerPhone ?? '' };
}

function OrgUnitModal({ editing, tree, onClose }: { editing: Editing | null; tree: LegalEntity[]; onClose: () => void }) {
  return (
    <Modal opened={!!editing} onClose={onClose} title={editing ? `${editing.row ? '編輯' : '新增'}${KIND_LABEL[editing.kind]}` : ''} centered>
      {/* Keyed so the form starts fresh for each row. */}
      {editing && <OrgUnitForm key={`${editing.kind}/${editing.row?.id ?? 'new'}`} editing={editing} tree={tree} onDone={onClose} />}
    </Modal>
  );
}

function OrgUnitForm({ editing, tree, onDone }: { editing: Editing; tree: LegalEntity[]; onDone: () => void }) {
  const [f, setF] = useState<UnitForm>(() => initialForm(editing));
  const set = (k: keyof UnitForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });
  const invalidate = useInvalidateOrg();
  const id = editing.row?.id;
  const save = useMutation({
    mutationFn: async () => {
      const t = (s: string) => s.trim();
      const opt = (s: string) => s.trim() || null;
      if (editing.kind === 'legal-entity') {
        const body = { code: t(f.code), name: t(f.name) };
        return id ? data(api.PATCH('/api/admin/org/legal-entities/{id}', { params: { path: { id } }, body }))
          : data(api.POST('/api/admin/org/legal-entities', { body }));
      }
      if (editing.kind === 'site') {
        const body = { legalEntityId: f.parentId!, code: t(f.code), name: t(f.name), address: opt(f.address) };
        return id ? data(api.PATCH('/api/admin/org/sites/{id}', { params: { path: { id } }, body }))
          : data(api.POST('/api/admin/org/sites', { body }));
      }
      const body = { siteId: f.parentId!, code: opt(f.code), name: t(f.name), managerName: opt(f.managerName), managerEmail: opt(f.managerEmail), managerPhone: opt(f.managerPhone) };
      return id ? data(api.PATCH('/api/admin/org/departments/{id}', { params: { path: { id } }, body }))
        : data(api.POST('/api/admin/org/departments', { body }));
    },
    onSuccess: async () => { await invalidate(); onDone(); },
  });

  const needsParent = editing.kind !== 'legal-entity';
  const codeRequired = editing.kind !== 'department';
  const emailBad = editing.kind === 'department' && f.managerEmail.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.managerEmail.trim());
  const ready = !!f.name.trim() && (!codeRequired || !!f.code.trim()) && (!needsParent || !!f.parentId) && !emailBad;
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) save.mutate(); };

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        {editing.kind === 'site' && (
          <Select label="法人" required data={tree.map(le => ({ value: le.id, label: `${le.name}（${le.code}）` }))} value={f.parentId} onChange={v => setF({ ...f, parentId: v })} />
        )}
        {editing.kind === 'department' && (
          <Select label="廠區" required data={siteOptions(tree)} value={f.parentId} onChange={v => setF({ ...f, parentId: v })} />
        )}
        <Group grow align="flex-start">
          <TextInput label="代碼" required={codeRequired} value={f.code} onChange={set('code')} maxLength={40}
            description={codeRequired ? '匯入檔以代碼對照，請勿任意更改' : '選填'} />
          <TextInput label="名稱" required value={f.name} onChange={set('name')} maxLength={100} data-autofocus
            description={editing.kind === 'department' ? '員工匯入以部門名稱對照' : undefined} />
        </Group>
        {editing.kind === 'site' && <TextInput label="地址" value={f.address} onChange={set('address')} maxLength={200} />}
        {editing.kind === 'department' && (
          <>
            <TextInput label="主管姓名" value={f.managerName} onChange={set('managerName')} maxLength={100} />
            <Group grow align="flex-start">
              <TextInput label="主管 Email" type="email" value={f.managerEmail} onChange={set('managerEmail')} error={emailBad ? 'Email 格式不正確' : undefined} />
              <TextInput label="主管電話" value={f.managerPhone} onChange={set('managerPhone')} maxLength={40} />
            </Group>
          </>
        )}
        <ErrorNote error={save.error} overrides={{ duplicate: DUPLICATE[editing.kind] }} />
        <FormActions busy={save.isPending} onCancel={onDone} disabled={!ready} />
      </Stack>
    </form>
  );
}

function DeleteUnit({ deleting, onClose }: { deleting: Deleting | null; onClose: () => void }) {
  const invalidate = useInvalidateOrg();
  const del = useMutation({
    mutationFn: ({ kind, id }: Deleting) => {
      const path = { params: { path: { id } } };
      if (kind === 'legal-entity') return data(api.DELETE('/api/admin/org/legal-entities/{id}', path));
      if (kind === 'site') return data(api.DELETE('/api/admin/org/sites/{id}', path));
      return data(api.DELETE('/api/admin/org/departments/{id}', path));
    },
    onSuccess: async () => { await invalidate(); close(); },
  });
  const close = () => { del.reset(); onClose(); };
  const what = deleting ? KIND_LABEL[deleting.kind] : '';
  return (
    <ConfirmModal opened={!!deleting} title={`刪除${what}`} confirmLabel="刪除" danger busy={del.isPending} error={del.error}
      errorOverrides={deleting ? { in_use: IN_USE[deleting.kind] } : undefined} onConfirm={() => deleting && del.mutate(deleting)} onClose={close}>
      確定要刪除{what}「{deleting?.name}」嗎？{deleting?.kind === 'department' ? '部門還有員工時不能刪除。' : `${what}底下還有${deleting?.kind === 'site' ? '部門、員工或負責人員' : '廠區或員工'}時不能刪除。`}
    </ConfirmModal>
  );
}

const SHEETS = [
  { sheet: '法人', columns: '代碼、名稱' },
  { sheet: '廠區', columns: '代碼、名稱、法人代碼、地址（選填）' },
  { sheet: '部門', columns: '廠區代碼、名稱、代碼、主管姓名、主管Email、主管電話（後四欄選填）' },
];

function OrgImport() {
  const invalidate = useInvalidateOrg();
  return (
    <Stack gap="md">
      <Text size="sm">
        工作表名稱與第一列欄位名稱需如下（可下載範本填寫，粗體為必填）。依代碼新增或更新（部門依廠區代碼＋名稱），檔案裡沒有的資料不會被刪除。可以只放其中幾張工作表。
      </Text>
      <Table withTableBorder verticalSpacing={6}>
        <Table.Thead><Table.Tr><Table.Th w={90}>工作表</Table.Th><Table.Th>欄位</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{SHEETS.map(s => <Table.Tr key={s.sheet}><Table.Td fw={600}>{s.sheet}</Table.Td><Table.Td fz="sm">{s.columns}</Table.Td></Table.Tr>)}</Table.Tbody>
      </Table>
      <DownloadButton download={downloadOrgTemplate} size="xs">下載匯入範本</DownloadButton>
      <ImportFlow<OrgImportReport>
        upload={importOrg}
        hasChanges={r => changes(r.legalEntities) + changes(r.sites) + changes(r.departments) > 0}
        onCommitted={() => void invalidate()}
        doneText={r => `已匯入：新增 ${r.legalEntities.create + r.sites.create + r.departments.create} 筆、更新 ${r.legalEntities.update + r.sites.update + r.departments.update} 筆。`}
        summary={r => <OrgImportSummary report={r} />}
      />
    </Stack>
  );
}

function OrgImportSummary({ report }: { report: OrgImportReport }) {
  const rows = [['法人', report.legalEntities], ['廠區', report.sites], ['部門', report.departments]] as const;
  return (
    <Table withTableBorder verticalSpacing={6}>
      <Table.Thead>
        <Table.Tr><Table.Th /><Table.Th ta="right">新增</Table.Th><Table.Th ta="right">更新</Table.Th><Table.Th ta="right">不變</Table.Th></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(([label, c]) => (
          <Table.Tr key={label}>
            <Table.Td fw={600}>{label}</Table.Td>
            <Table.Td ta="right">{c.create ? <ToneBadge tone="ok">{c.create}</ToneBadge> : 0}</Table.Td>
            <Table.Td ta="right">{c.update ? <ToneBadge tone="warn">{c.update}</ToneBadge> : 0}</Table.Td>
            <Table.Td ta="right" c="dimmed">{c.unchanged}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
