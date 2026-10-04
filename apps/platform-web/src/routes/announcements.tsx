import { Button, Card, Group, Input, Modal, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { announcementsQuery, api, tenantsQuery, type Announcement, type Tenant } from '../api';
import {
  ANNOUNCEMENT_PHASE, announcementBody, announcementPhase, announcementProblems, announcementToForm, emptyAnnouncementForm, type AnnouncementForm,
} from '../announcements';
import { DangerButton, ErrorAlert, Footnote, LabelBadge, LoadError, PageLoader, useDialog } from '../components';
import { formatDateTime } from '../format';
import { ANNOUNCEMENT_KIND, ANNOUNCEMENT_KINDS } from '../labels';
import { useCan } from '../permissions';

export const Route = createFileRoute('/announcements')({ component: AnnouncementsPage });

/** Select needs a non-empty value for "every tenant"; the API's is null. */
const ALL = 'all';

function AnnouncementsPage() {
  const { data: rows, error, refetch } = useQuery(announcementsQuery);
  const tenants = useQuery(tenantsQuery).data ?? [];
  const editor = useDialog<Announcement | 'new'>();
  const deleter = useDialog<Announcement>();
  const canWrite = useCan('announcements:write');
  const audience = (tenantId: string | null) => (tenantId ? tenants.find(t => t.id === tenantId)?.name ?? '指定租戶' : '所有租戶');

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>系統公告</Title>
        {canWrite && <Button leftSection={<IconPlus size={16} />} onClick={() => editor.open('new')}>新增公告</Button>}
      </Group>
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : !rows ? <PageLoader /> : (
        <Card>
          {rows.length === 0 ? <Text c="dimmed" ta="center" py="lg">還沒有公告。{canWrite && '維護通知或新功能說明可以在這裡發布到租戶後台。'}</Text> : (
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>公告</Table.Th><Table.Th>類型</Table.Th><Table.Th>對象</Table.Th><Table.Th>發布時間</Table.Th>
                    <Table.Th>下架時間</Table.Th><Table.Th>狀態</Table.Th>{canWrite && <Table.Th aria-label="操作" />}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map(a => (
                    <Table.Tr key={a.id}>
                      <Table.Td maw={340}>
                        <Text size="sm" fw={600}>{a.title}</Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>{a.body}</Text>
                      </Table.Td>
                      <Table.Td><LabelBadge value={ANNOUNCEMENT_KIND[a.kind]} /></Table.Td>
                      <Table.Td>{audience(a.tenantId)}</Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.publishAt)}</Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{a.expiresAt ? formatDateTime(a.expiresAt) : <Text span size="sm" c="dimmed">不下架</Text>}</Table.Td>
                      <Table.Td><LabelBadge value={ANNOUNCEMENT_PHASE[announcementPhase(a)]} /></Table.Td>
                      {canWrite && (
                        <Table.Td>
                          <Group gap={4} wrap="nowrap" justify="flex-end">
                            <Button variant="subtle" size="compact-sm" onClick={() => editor.open(a)}>編輯</Button>
                            <Button variant="subtle" size="compact-sm" c="var(--yutis-bad)" onClick={() => deleter.open(a)}>刪除</Button>
                          </Group>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
      )}
      <Footnote>公告會顯示在租戶後台，時間以台灣時間為準。</Footnote>

      <Modal opened={editor.opened} onClose={editor.close} title={editor.target === 'new' ? '新增公告' : '編輯公告'} centered radius="lg" size="lg">
        {editor.target && <AnnouncementEditor announcement={editor.target === 'new' ? null : editor.target} tenants={tenants} onClose={editor.close} />}
      </Modal>
      <Modal opened={deleter.opened} onClose={deleter.close} title="刪除公告" centered radius="lg">
        {deleter.target && <DeleteAnnouncement announcement={deleter.target} onClose={deleter.close} />}
      </Modal>
    </Stack>
  );
}

function AnnouncementEditor({ announcement, tenants, onClose }: { announcement: Announcement | null; tenants: Tenant[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AnnouncementForm>(() => (announcement ? announcementToForm(announcement) : emptyAnnouncementForm()));
  const [submitted, setSubmitted] = useState(false);
  const save = useMutation({
    mutationFn: (f: AnnouncementForm) => announcement
      ? data(api.PATCH('/platform-api/announcements/{id}', { params: { path: { id: announcement.id } }, body: announcementBody(f) }))
      : data(api.POST('/platform-api/announcements', { body: announcementBody(f) })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: announcementsQuery.queryKey }); onClose(); },
  });
  const problems = announcementProblems(form);
  const err = (k: keyof AnnouncementForm) => submitted && problems[k];
  const set = <K extends keyof AnnouncementForm>(k: K, v: AnnouncementForm[K]) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Stack>
      <Select label="對象" allowDeselect={false} searchable value={form.tenantId || ALL} onChange={v => set('tenantId', !v || v === ALL ? '' : v)}
        data={[{ value: ALL, label: '所有租戶' }, ...tenants.map(t => ({ value: t.id, label: t.name }))]} />
      <Input.Wrapper label="類型">
        <SegmentedControl fullWidth mt={4} value={form.kind} onChange={v => set('kind', v as AnnouncementForm['kind'])}
          data={ANNOUNCEMENT_KINDS.map(k => ({ value: k, label: ANNOUNCEMENT_KIND[k].label }))} />
      </Input.Wrapper>
      <TextInput label="標題" withAsterisk maxLength={200} value={form.title} onChange={e => set('title', e.currentTarget.value)} error={err('title')} />
      <Textarea label="內容" withAsterisk autosize minRows={5} maxRows={12} maxLength={5000} value={form.body} onChange={e => set('body', e.currentTarget.value)} error={err('body')} />
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput type="datetime-local" label="發布時間" description="台灣時間" withAsterisk value={form.publishAt}
          onChange={e => set('publishAt', e.currentTarget.value)} error={err('publishAt')} />
        <TextInput type="datetime-local" label="下架時間" description="留空表示不會自動下架" value={form.expiresAt}
          onChange={e => set('expiresAt', e.currentTarget.value)} error={err('expiresAt')} />
      </SimpleGrid>
      {save.error && <ErrorAlert error={save.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setSubmitted(true); if (!Object.keys(problems).length) save.mutate(form); }}>
          {announcement ? '儲存' : '發布'}
        </Button>
      </Group>
    </Stack>
  );
}

function DeleteAnnouncement({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => data(api.DELETE('/platform-api/announcements/{id}', { params: { path: { id: announcement.id } } })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: announcementsQuery.queryKey }); onClose(); },
  });
  return (
    <Stack>
      <Text size="sm">確定要刪除「{announcement.title}」嗎？租戶後台會立即看不到這則公告，刪除後無法復原。</Text>
      {remove.error && <ErrorAlert error={remove.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <DangerButton loading={remove.isPending} onClick={() => remove.mutate()}>刪除</DangerButton>
      </Group>
    </Stack>
  );
}
