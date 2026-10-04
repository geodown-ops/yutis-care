import { Button, Card, Group, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { StatCard } from '@yutis/ui';
import { useState } from 'react';
import { todayIso } from '../../cases';
import { useMe } from '../../session';
import { CardNote } from '../states';
import { serviceRecordsQuery } from './queries';
import { StatusBadge } from './parts';
import { RecordFormModal, type FormMode } from './RecordFormModal';
import { RecordViewModal, SignLinksModal } from './RecordViewModal';
import {
  copyForm, countByStatus, filterRecords, formFromRecord, newForm, readContent, slashDate, signProgress, STATUSES, timeRange, usedValues,
  type RecordFilter, type ServiceForm, type ServiceRecord, type ServiceStatus, type SignLink,
} from './records';

interface Editing { key: number; mode: FormMode; recordId?: string; form: ServiceForm }

/** 勞工健康服務執行紀錄表（附表八）: on-site service records of my sites and their sign-off. */
export function ServiceRecordsPage() {
  const me = useMe();
  const { data: records } = useSuspenseQuery(serviceRecordsQuery);
  const [filter, setFilter] = useState<RecordFilter>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [links, setLinks] = useState<{ title: string; links: SignLink[] } | null>(null);
  const sites = [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
  const counts = countByStatus(records);
  const rows = filterRecords(records, filter);
  const viewing = viewingId ? records.find(r => r.id === viewingId) : undefined;
  const filtered = !!(filter.status || filter.siteId || filter.from || filter.to);
  const waiting = records.filter(r => r.status === '簽核中').reduce((n, r) => n + r.signatures.filter(s => !s.signedAt).length, 0);

  const edit = (mode: FormMode, form: ServiceForm, recordId?: string) => { setViewingId(null); setEditing({ key: Date.now(), mode, form, recordId }); };
  const open = (r: ServiceRecord) => (r.status === '草稿' ? edit('edit', formFromRecord(r), r.id) : setViewingId(r.id));
  const copy = (r: ServiceRecord) => edit('copy', copyForm(r, todayIso(), me.id));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>勞工健康服務執行紀錄表</Title>
        <Button leftSection={<IconPlus size={16} />} disabled={!sites.length}
          onClick={() => edit('new', newForm({ today: todayIso(), siteId: sites[0]?.id ?? '', me }))}>新增紀錄</Button>
      </Group>

      <Card>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          <StatCard tone="lavender" label="草稿" value={counts['草稿']} note="尚未送出簽核" />
          <StatCard tone="blue" label="簽核中" value={counts['簽核中']} note={waiting ? `${waiting} 位尚未簽核` : '等待簽核'} />
          <StatCard tone="mint" label="已完成" value={counts['已完成']} note="全部簽核完成" />
        </SimpleGrid>
      </Card>

      <Card>
        <Group gap="sm" mb="md" justify="space-between" align="flex-end">
          <SegmentedControl size="xs" aria-label="紀錄狀態" value={filter.status ?? 'all'}
            onChange={v => setFilter(f => ({ ...f, status: v === 'all' ? undefined : (v as ServiceStatus) }))}
            data={[{ value: 'all', label: '全部' }, ...STATUSES.map(s => ({ value: s, label: s }))]} />
          <Group gap="sm" align="flex-end">
            {sites.length > 1 && (
              <Select aria-label="地點" placeholder="全部地點" clearable size="xs" w={140} value={filter.siteId ?? null}
                data={sites.map(s => ({ value: s.id, label: s.name }))} onChange={v => setFilter(f => ({ ...f, siteId: v ?? undefined }))} />
            )}
            <Group gap={6} wrap="nowrap" align="center">
              <TextInput type="date" size="xs" aria-label="執行日期起" value={filter.from ?? ''} onChange={e => { const v = e.currentTarget.value; setFilter(f => ({ ...f, from: v || undefined })); }} />
              <Text size="xs" c="dimmed">～</Text>
              <TextInput type="date" size="xs" aria-label="執行日期迄" value={filter.to ?? ''} onChange={e => { const v = e.currentTarget.value; setFilter(f => ({ ...f, to: v || undefined })); }} />
            </Group>
          </Group>
        </Group>

        <Table.ScrollContainer minWidth={860}>
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
                    <Table.Td>{c.executorUserId === me.id ? me.name : <Text span c="dimmed" size="sm">其他人員</Text>}</Table.Td>
                    <Table.Td><StatusBadge status={r.status} /></Table.Td>
                    <Table.Td><Text size="sm" c={r.status === '草稿' ? 'dimmed' : undefined}>{p.total ? `${p.signed}／${p.total} 已簽核` : '未設定'}</Text></Table.Td>
                    <Table.Td onClick={e => e.stopPropagation()}>
                      <Group gap={6} justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="default" onClick={() => open(r)}>{r.status === '草稿' ? '編輯' : '檢視'}</Button>
                        <Button size="xs" variant="subtle" color="gray" onClick={() => copy(r)} title="以這筆紀錄為範本建立新紀錄">複製</Button>
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
        <RecordFormModal key={editing.key} mode={editing.mode} recordId={editing.recordId} initial={editing.form}
          roleSuggestions={usedValues(records, r => r.signatures.map(s => s.role))}
          categorySuggestions={usedValues(records, r => readContent(r.content).special.map(s => s.category))}
          onClose={() => setEditing(null)}
          onSubmitted={l => { setEditing(null); setLinks({ title: '已送出簽核', links: l }); }} />
      )}
      {viewing && (
        <RecordViewModal record={viewing} onClose={() => setViewingId(null)} onCopy={() => copy(viewing)}
          onResent={l => setLinks({ title: '已重寄簽核連結', links: l })} />
      )}
      {links && <SignLinksModal title={links.title} links={links.links} onClose={() => setLinks(null)} />}
    </Stack>
  );
}
