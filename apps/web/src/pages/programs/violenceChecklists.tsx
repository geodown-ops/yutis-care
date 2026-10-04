/* 不法侵害預防 · 作業場所與人力檢點表 (職護、職醫、職安衛人員). */
import { Box, Button, Card, Group, Modal, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { todayIso } from '../../cases';
import { CardNote, problemText } from '../states';
import { OrgFilterSelects } from './listControls';
import { matchOrg, NO_ORG_FILTER, withRowDepartments, type OrgFilter } from './lists';
import { DateField, DepartmentSelect, dt, Kv, saveProblem, ToneBadge, useModalSize, useMySites, useOrgNames, useSiteName } from './maternalViolenceCommon';
import { CHECKLIST_GROUPS, checklistBody, pickSite, type Checklist, type ChecklistKind, type Place } from './violence';
import { checklistsQuery } from './violenceQueries';

const TITLE: Record<ChecklistKind, string> = { 作業場所: '作業場所檢點表', 人力: '人力配置檢點表' };

export function ViolenceChecklistTab({ kind, checklists }: { kind: ChecklistKind; checklists: UseQueryResult<Checklist[]> }) {
  const sites = useMySites();
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Checklist | null>(null);
  const ofKind = (checklists.data ?? []).filter(c => c.kind === kind);
  const names = withRowDepartments(useOrgNames(), ofKind);
  const rows = ofKind.filter(c => matchOrg(c, org));
  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Group gap="sm">
          <OrgFilterSelects rows={ofKind} names={names} value={org} onChange={setOrg} />
          <Text size="sm" c="dimmed">{CHECKLIST_GROUPS[kind].map(g => g.name).join('、')}</Text>
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating(true)} disabled={!sites.length}>新增{TITLE[kind]}</Button>
      </Group>
      {checklists.isPending ? <Skeleton h={200} /> : checklists.isError ? <CardNote>{problemText(checklists.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>檢點日期</Table.Th><Table.Th>廠區</Table.Th><Table.Th>部門</Table.Th><Table.Th ta="right">已檢點項目</Table.Th><Table.Th>需改善</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(c => {
                  const bad = c.items.filter(i => !i.ok).length;
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{dt(c.checkedOn)}</Table.Td>
                      <Table.Td>{names.site(c.siteId)}</Table.Td>
                      <Table.Td>{c.departmentName ?? <Text span size="sm" c="dimmed">全廠</Text>}</Table.Td>
                      <Table.Td ta="right">{c.items.length} 項</Table.Td>
                      <Table.Td>{bad ? <ToneBadge tone="warn">{bad} 項</ToneBadge> : <ToneBadge tone="ok">無</ToneBadge>}</Table.Td>
                      <Table.Td ta="right"><Button variant="default" size="xs" onClick={() => setViewing(c)}>檢視</Button></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{ofKind.length ? '沒有符合條件的檢點表。' : `還沒有${TITLE[kind]}。`}</CardNote>}
        </>
      )}
      <NewChecklistModal kind={kind} opened={creating} onClose={() => setCreating(false)} />
      <ChecklistDetailModal checklist={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

function ChecklistDetailModal({ checklist, onClose }: { checklist: Checklist | null; onClose: () => void }) {
  const siteName = useSiteName();
  const size = useModalSize('lg');
  return (
    <Modal opened={!!checklist} onClose={onClose} title={checklist ? TITLE[checklist.kind] : ''} {...size}>
      {checklist && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Kv label="檢點日期" value={dt(checklist.checkedOn)} />
            <Kv label="廠區" value={siteName(checklist.siteId)} />
            <Kv label="部門" value={checklist.departmentName ?? '全廠'} />
            <Kv label="需改善" value={`${checklist.items.filter(i => !i.ok).length} 項`} />
          </SimpleGrid>
          <Table verticalSpacing={6}>
            <Table.Thead><Table.Tr><Table.Th>檢點項目</Table.Th><Table.Th>結果</Table.Th><Table.Th>現況與改善措施</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {checklist.items.map((i, n) => (
                <Table.Tr key={n}>
                  <Table.Td>{i.item}</Table.Td>
                  <Table.Td>{i.ok ? <ToneBadge tone="ok">符合</ToneBadge> : <ToneBadge tone="warn">需改善</ToneBadge>}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{i.note || '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Modal>
  );
}

function NewChecklistModal({ kind, opened, onClose }: { kind: ChecklistKind; opened: boolean; onClose: () => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={opened} onClose={onClose} title={`新增${TITLE[kind]}`} {...size}>
      {opened && <NewChecklistForm kind={kind} onDone={onClose} />}
    </Modal>
  );
}

type Answer = { ok: boolean | null; note: string };
const ANSWER = [{ value: '', label: '未檢點' }, { value: 'ok', label: '符合' }, { value: 'bad', label: '需改善' }];

function NewChecklistForm({ kind, onDone }: { kind: ChecklistKind; onDone: () => void }) {
  const qc = useQueryClient();
  const sites = useMySites();
  const today = todayIso();
  const [checkedOn, setCheckedOn] = useState(today);
  const [place, setPlace] = useState<Place>({ siteId: sites[0]?.id ?? null, departmentId: null });
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(CHECKLIST_GROUPS[kind].flatMap(g => g.items).map(i => [i, { ok: null, note: '' }])));
  const [tried, setTried] = useState(false);
  const items = checklistBody(answers);
  const problem = !checkedOn ? '請填寫檢點日期。' : checkedOn > today ? '檢點日期不能晚於今天。' : !place.siteId ? '請選擇廠區。' : !items.length ? '請至少檢點一個項目。' : null;
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/programs/violence/checklists', {
      body: { kind, siteId: place.siteId!, departmentId: place.departmentId, checkedOn, items },
    })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: checklistsQuery.queryKey }); onDone(); },
  });
  const set = (item: string, patch: Partial<Answer>) => setAnswers(a => ({ ...a, [item]: { ...a[item]!, ...patch } }));

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <DateField label="檢點日期" required max={today} value={checkedOn} onChange={e => setCheckedOn(e.currentTarget.value)} />
        <Select label="廠區" required value={place.siteId} onChange={v => setPlace(p => pickSite(p, v))} data={sites.map(s => ({ value: s.id, label: s.name }))}
          allowDeselect={false} />
        <DepartmentSelect siteId={place.siteId} value={place.departmentId} onChange={departmentId => setPlace(p => ({ ...p, departmentId }))} />
      </SimpleGrid>
      {CHECKLIST_GROUPS[kind].map(g => (
        <div key={g.name}>
          <Text fw={600} mb="xs">{g.name}</Text>
          <Stack gap="xs">
            {g.items.map(item => {
              const a = answers[item]!;
              return (
                <Box key={item} p="sm" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
                  <Group justify="space-between" gap="xs" mb={a.ok === null ? 0 : 6}>
                    <Text size="sm" fw={500} style={{ flex: 1, minWidth: 160 }}>{item}</Text>
                    <SegmentedControl size="xs" data={ANSWER} aria-label={`${item}結果`}
                      value={a.ok === null ? '' : a.ok ? 'ok' : 'bad'} onChange={v => set(item, { ok: v === '' ? null : v === 'ok' })} />
                  </Group>
                  {a.ok !== null && (
                    <TextInput size="xs" maxLength={500} value={a.note} onChange={e => set(item, { note: e.currentTarget.value })} aria-label={`${item}說明`}
                      placeholder={a.ok ? '現況描述（含現有措施，選填）' : '應增加或改善之措施'} />
                  )}
                </Box>
              );
            })}
          </Stack>
        </div>
      ))}
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(save.error)}</Text>}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">已檢點 {items.length} 項</Text>
        <Group>
          <Button variant="default" onClick={onDone}>取消</Button>
          <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate(); }}>儲存</Button>
        </Group>
      </Group>
    </Stack>
  );
}
