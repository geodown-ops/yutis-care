import { Alert, Button, Card, Divider, Group, Modal, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { CardNote } from '../states';
import { COLUMN_FIELDS, emptyMappingForm, MAPPABLE_ITEMS, mappingBody, mappingProblems, mappingSummary, mappingToForm, type ExamMapping, type MappingForm } from './mappings';
import { downloadMappingTemplate, examMappingsQuery } from './queries';
import { AdminTitle, ConfirmModal, DownloadButton, ErrorNote, FormActions } from './ui';

/** 健檢匯入對照: per clinic, which Excel column holds which field and exam item. Nurses pick the clinic when importing. */
export function ExamMappingPage() {
  const { data: mappings } = useSuspenseQuery(examMappingsQuery);
  const [editing, setEditing] = useState<ExamMapping | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ExamMapping | null>(null);

  return (
    <Stack gap="lg">
      <AdminTitle title="健檢匯入對照" description="每家健檢醫院的 Excel 欄位名稱不同。設定一次對照後，職護匯入健檢時選擇醫院，系統就知道每一欄是什麼。也可以下載依對照產生的空白範本，交給健檢醫院照著填。"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>新增對照</Button>} />
      <Card>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>健檢醫院</Table.Th><Table.Th>員工對照</Table.Th><Table.Th>檢查日期欄</Table.Th><Table.Th ta="right">檢查項目</Table.Th><Table.Th ta="right">其他欄位</Table.Th><Table.Th w={230} /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {mappings.map(m => {
                const s = mappingSummary(m);
                const form = mappingToForm(m);
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td fw={600}>{m.clinic}</Table.Td>
                    <Table.Td>{s.matchBy}</Table.Td>
                    <Table.Td fz="sm">{form.columns.examDate ?? '—'}</Table.Td>
                    <Table.Td ta="right">{s.items} 項</Table.Td>
                    <Table.Td ta="right">{s.fields} 欄</Table.Td>
                    <Table.Td>
                      <Group gap={6} justify="flex-end" align="flex-start" wrap="nowrap">
                        <DownloadButton size="compact-sm" variant="subtle" download={() => downloadMappingTemplate(m)} aria-label={`下載 ${m.clinic} 的空白範本`}>範本</DownloadButton>
                        <Button size="compact-sm" variant="default" onClick={() => setEditing(m)} aria-label={`編輯 ${m.clinic}`}>編輯</Button>
                        <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setDeleting(m)} aria-label={`刪除 ${m.clinic}`}>刪除</Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {mappings.length === 0 && <CardNote>還沒有任何對照。新增第一家健檢醫院的欄位對照後，職護才能匯入健檢報告。</CardNote>}
      </Card>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? '新增健檢匯入對照' : editing ? `編輯對照 · ${editing.clinic}` : ''} size="xl">
        {editing && <MappingFormView key={editing === 'new' ? 'new' : editing.id} mapping={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <DeleteMapping mapping={deleting} onClose={() => setDeleting(null)} />
    </Stack>
  );
}

function MappingFormView({ mapping, onDone }: { mapping: ExamMapping | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<MappingForm>(() => (mapping ? mappingToForm(mapping) : emptyMappingForm()));
  const [tried, setTried] = useState(false);
  const problems = mappingProblems(f);
  const save = useMutation({
    mutationFn: () => mapping
      ? data(api.PUT('/api/admin/exam-mappings/{id}', { params: { path: { id: mapping.id } }, body: mappingBody(f) }))
      : data(api.POST('/api/admin/exam-mappings', { body: mappingBody(f) })),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'exam-mappings'] }); onDone(); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0) save.mutate();
  };
  const fieldError = (key: string) => {
    if (!tried) return undefined;
    if (key === 'examDate') return problems.examDate;
    if (key === 'empNo' || key === 'nationalId') return problems.match ? ' ' : undefined;
    return undefined;
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <TextInput label="健檢醫院" required value={f.clinic} onChange={e => setF({ ...f, clinic: e.currentTarget.value })} maxLength={100}
          placeholder="例如 仁安健康管理診所" error={tried ? problems.clinic : undefined} data-autofocus />
        <Text size="sm" c="dimmed">每一格填這家醫院 Excel 第一列的欄位名稱，要與檔案完全相同。沒有的欄位留空。</Text>

        <Divider label="員工與檢查資料" labelPosition="left" />
        {tried && problems.match && <Alert color="red" variant="light" p="xs">{problems.match}</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="xs">
          {COLUMN_FIELDS.map(c => (
            <TextInput key={c.key} label={c.label} description={c.hint} required={c.key === 'examDate'} maxLength={100} placeholder="Excel 欄名"
              value={f.columns[c.key] ?? ''} error={fieldError(c.key)}
              onChange={e => setF({ ...f, columns: { ...f.columns, [c.key]: e.currentTarget.value } })} />
          ))}
        </SimpleGrid>

        <Divider label="檢查項目" labelPosition="left" />
        {tried && problems.items && <Alert color="red" variant="light" p="xs">{problems.items}</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="xs">
          {MAPPABLE_ITEMS.map(it => (
            <TextInput key={it.code} label={`${it.name}${it.unit ? `（${it.unit}）` : ''}`} description={it.code} maxLength={100} placeholder="Excel 欄名"
              value={f.items[it.code] ?? ''} onChange={e => setF({ ...f, items: { ...f.items, [it.code]: e.currentTarget.value } })} />
          ))}
        </SimpleGrid>

        {/* The form is long: repeat what is missing next to the button. */}
        {tried && Object.keys(problems).length > 0 && (
          <Alert color="red" variant="light" p="xs"><Stack gap={2}>{Object.values(problems).map(t => <Text key={t} size="sm">{t}</Text>)}</Stack></Alert>
        )}
        <ErrorNote error={save.error} overrides={{ duplicate: '這家健檢醫院已經有對照，請直接編輯它。' }} />
        <FormActions busy={save.isPending} onCancel={onDone} />
      </Stack>
    </form>
  );
}

function DeleteMapping({ mapping, onClose }: { mapping: ExamMapping | null; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => data(api.DELETE('/api/admin/exam-mappings/{id}', { params: { path: { id } } })),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'exam-mappings'] }); close(); },
  });
  const close = () => { del.reset(); onClose(); };
  return (
    <ConfirmModal opened={!!mapping} title="刪除對照" confirmLabel="刪除" danger busy={del.isPending} error={del.error}
      onConfirm={() => mapping && del.mutate(mapping.id)} onClose={close}>
      確定要刪除「{mapping?.clinic}」的欄位對照嗎？已匯入的健檢不受影響，但之後不能再用這個對照匯入。
    </ConfirmModal>
  );
}
