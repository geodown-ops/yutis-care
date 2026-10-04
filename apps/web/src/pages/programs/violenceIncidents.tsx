/* 不法侵害預防 · 事件通報與處理 (職護、職醫 only; managers never see incidents). */
import { Button, Card, Chip, Group, Modal, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { Schemas } from '@yutis/api-client';
import { useState } from 'react';
import { todayIso } from '../../cases';
import { employeeQuery } from '../../queries';
import { CardNote, problemText } from '../states';
import { OrgFilterSelects } from './listControls';
import { matchOrg, NO_ORG_FILTER, withRowDepartments, type OrgFilter } from './lists';
import {
  DateField, DepartmentSelect, dt, EmployeePicker, Kv, PersonLink, saveProblem, ToneBadge, useModalSize, useMySites, useOrgNames, useSiteName,
} from './maternalViolenceCommon';
import {
  incidentBody, incidentDraft, incidentPatch, incidentProblem, pickSite, VIO_FOLLOW, VIO_INC_TYPES, withSaved, type Incident, type IncidentDraft,
} from './violence';
import { useCreateIncident, useUpdateIncident } from './violenceQueries';

type Employee = Schemas['EmployeeDto'];

/** Incidents name the victim by id only; their names come from the (cached, audited) employee records. */
function useVictims(incidents: readonly Incident[]) {
  const ids = [...new Set(incidents.flatMap(i => (i.victimEmployeeId ? [i.victimEmployeeId] : [])))];
  const results = useQueries({ queries: ids.map(id => ({ ...employeeQuery(id), staleTime: 5 * 60_000 })) });
  return new Map<string, VictimState>(ids.map((id, n) => [id, results[n]?.data ?? (results[n]?.isError ? 'unavailable' : 'loading')]));
}

type VictimState = Schemas['EmployeeDetailDto'] | 'loading' | 'unavailable';
type Victims = Map<string, VictimState>;

function Victim({ id, victims }: { id: string | null; victims: Victims }) {
  if (!id) return <Text span size="sm" c="dimmed">未指定</Text>;
  const e = victims.get(id);
  if (!e || e === 'loading') return <Text span size="sm" c="dimmed">…</Text>;
  if (e === 'unavailable') return <Text span size="sm" c="dimmed">無法顯示</Text>;
  return <PersonLink employeeId={id} name={e.name} empNo={e.empNo} />;
}

const Dim = ({ children }: { children: string }) => <Text span size="sm" c="dimmed">{children}</Text>;

export function ViolenceIncidentsTab({ incidents, onNotice }: { incidents: UseQueryResult<Incident[]>; onNotice: (text: string) => void }) {
  const names = withRowDepartments(useOrgNames(), incidents.data ?? []);
  const sites = useMySites();
  const victims = useVictims(incidents.data ?? []);
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = incidents.data?.find(i => i.id === viewingId) ?? null;
  const rows = (incidents.data ?? []).filter(i => matchOrg(i, org));
  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Group gap="sm">
          <OrgFilterSelects rows={incidents.data ?? []} names={names} value={org} onChange={setOrg} />
          <Text size="sm" c="dimmed">事件內容加密儲存，只有職護、職醫看得到。</Text>
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating(true)} disabled={!sites.length}>新增事件通報</Button>
      </Group>
      {incidents.isPending ? <Skeleton h={200} /> : incidents.isError ? <CardNote>{problemText(incidents.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={860}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>發生日期</Table.Th><Table.Th>廠區</Table.Th><Table.Th>部門</Table.Th><Table.Th>類型</Table.Th><Table.Th>受害員工</Table.Th><Table.Th>後續協助</Table.Th>
                  <Table.Th>狀態</Table.Th><Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(i => (
                  <Table.Tr key={i.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{dt(i.occurredOn)}</Table.Td>
                    <Table.Td>{names.site(i.siteId)}</Table.Td>
                    <Table.Td>{i.departmentName ?? <Dim>—</Dim>}</Table.Td>
                    <Table.Td><ToneBadge tone="bad">{i.type}</ToneBadge></Table.Td>
                    <Table.Td><Victim id={i.victimEmployeeId} victims={victims} /></Table.Td>
                    <Table.Td>{i.followUps.join('、') || '—'}</Table.Td>
                    <Table.Td><ToneBadge tone={i.status === '結案' ? 'ok' : 'warn'}>{i.status}</ToneBadge></Table.Td>
                    <Table.Td ta="right"><Button variant="default" size="xs" onClick={() => setViewingId(i.id)}>檢視</Button></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{incidents.data.length ? '沒有符合條件的事件。' : '目前沒有不法侵害事件通報。'}</CardNote>}
        </>
      )}
      <NewIncidentModal opened={creating} onClose={() => setCreating(false)} />
      <IncidentModal incident={viewing} victims={victims} onClose={() => setViewingId(null)} onNotice={onNotice} />
    </Card>
  );
}

/** One incident: read it, close or reopen it, or edit it in place. */
function IncidentModal({ incident, victims, onClose, onNotice }: {
  incident: Incident | null; victims: Victims; onClose: () => void; onNotice: (text: string) => void;
}) {
  const size = useModalSize('lg');
  const [editing, setEditing] = useState(false);
  const close = () => { setEditing(false); onClose(); };
  const victim = incident?.victimEmployeeId ? victims.get(incident.victimEmployeeId) : undefined;
  return (
    <Modal opened={!!incident} onClose={close} title={editing ? '編輯不法侵害事件' : '不法侵害事件'} {...size}>
      {incident && (editing
        ? <IncidentForm key={incident.id} incident={incident} savedVictim={victim} onCancel={() => setEditing(false)}
            onSaved={changed => { setEditing(false); if (changed) onNotice('已更新事件通報。'); }} />
        : <IncidentView key={incident.id} incident={incident} victims={victims} onClose={close} onEdit={() => setEditing(true)} onNotice={onNotice} />)}
    </Modal>
  );
}

function IncidentView({ incident, victims, onClose, onEdit, onNotice }: {
  incident: Incident; victims: Victims; onClose: () => void; onEdit: () => void; onNotice: (text: string) => void;
}) {
  const siteName = useSiteName();
  const status = useUpdateIncident();
  const next = incident.status === '結案' ? '處理中' : '結案';
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <Kv label="發生日期" value={dt(incident.occurredOn)} />
        <Kv label="廠區" value={siteName(incident.siteId)} />
        <Kv label="部門" value={incident.departmentName ?? '未指定'} />
        <Kv label="類型" value={incident.type} />
        <Kv label="受害員工" value={<Victim id={incident.victimEmployeeId} victims={victims} />} />
        <Kv label="狀態" value={<ToneBadge tone={incident.status === '結案' ? 'ok' : 'warn'}>{incident.status}</ToneBadge>} />
      </SimpleGrid>
      <div>
        <Text size="sm" fw={600} mb={4}>事件經過與處理</Text>
        <Text size="sm" c={incident.detail ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>{incident.detail || '未填寫'}</Text>
      </div>
      <div>
        <Text size="sm" fw={600} mb={4}>後續協助</Text>
        <Text size="sm" c={incident.followUps.length ? undefined : 'dimmed'}>{incident.followUps.join('、') || '無'}</Text>
      </div>
      {status.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(status.error)}</Text>}
      <Group justify="space-between" gap="sm">
        <Text size="xs" c="dimmed">這次查看已記入存取紀錄。</Text>
        <Group gap="sm">
          <Button variant="default" onClick={onClose}>關閉</Button>
          <Button variant="default" onClick={onEdit} disabled={status.isPending}>編輯</Button>
          <Button variant={next === '結案' ? 'filled' : 'default'} loading={status.isPending}
            onClick={() => status.mutate({ id: incident.id, body: { status: next } }, { onSuccess: () => onNotice(next === '結案' ? '事件已結案。' : '事件已重新開啟，狀態為處理中。') })}>
            {next === '結案' ? '結案' : '重新開啟'}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

function NewIncidentModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={opened} onClose={onClose} title="新增不法侵害事件通報" {...size}>
      {opened && <IncidentForm incident={null} onCancel={onClose} onSaved={onClose} />}
    </Modal>
  );
}

/**
 * A new report (POST) or an edit (PATCH with only what changed). The department is one of the chosen site's; another
 * site clears it, and an edit that moves the site sends the new department (or none) with it.
 */
function IncidentForm({ incident, savedVictim, onCancel, onSaved }: {
  incident: Incident | null; savedVictim?: VictimState; onCancel: () => void; onSaved: (changed: boolean) => void;
}) {
  const sites = useMySites();
  const today = todayIso();
  const [d, setD] = useState<IncidentDraft>(() => incidentDraft(incident, { today, siteId: sites[0]?.id ?? null }));
  const [victim, setVictim] = useState<Employee | null>(typeof savedVictim === 'object' ? savedVictim : null);
  const [tried, setTried] = useState(false);
  const create = useCreateIncident();
  const update = useUpdateIncident();
  const problem = incidentProblem(d, today);
  const error = create.error ?? update.error;
  const set = (patch: Partial<IncidentDraft>) => setD(x => ({ ...x, ...patch }));
  // A victim on record whose employee file cannot be shown stays unless another is picked.
  const hiddenVictim = !!incident?.victimEmployeeId && !victim && d.victimEmployeeId === incident.victimEmployeeId;

  const pickVictim = (e: Employee | null) => {
    setVictim(e);
    setD(x => {
      const next = { ...x, victimEmployeeId: e?.id ?? null };
      // A new report follows the victim to their site, when it is one of mine.
      return !incident && e && sites.some(s => s.id === e.site.id) ? pickSite(next, e.site.id) : next;
    });
  };
  const submit = () => {
    setTried(true);
    if (problem) return;
    if (!incident) return create.mutate(incidentBody(d), { onSuccess: () => onSaved(true) });
    const body = incidentPatch(incident, d);
    if (!Object.keys(body).length) return onSaved(false);
    update.mutate({ id: incident.id, body }, { onSuccess: () => onSaved(true) });
  };

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <DateField label="發生日期" required max={today} value={d.occurredOn} onChange={e => set({ occurredOn: e.currentTarget.value })} />
        <Select label="廠區" required value={d.siteId} onChange={v => setD(x => pickSite(x, v))} data={sites.map(s => ({ value: s.id, label: s.name }))}
          allowDeselect={false} />
        <DepartmentSelect siteId={d.siteId} value={d.departmentId} onChange={v => set({ departmentId: v })} />
      </SimpleGrid>
      <div>
        <Text size="sm" fw={500} mb={6}>不法侵害類型 <Text span c="var(--yutis-bad)">*</Text></Text>
        <Chip.Group value={d.type} onChange={v => set({ type: v as string })}>
          <Group gap={6}>{withSaved(VIO_INC_TYPES, incident ? [incident.type] : []).map(t => <Chip key={t} value={t} size="xs">{t}</Chip>)}</Group>
        </Chip.Group>
      </div>
      <EmployeePicker label="受害員工" value={victim} onChange={pickVictim}
        description={hiddenVictim ? '這裡無法顯示原受害員工；不重新選擇就維持不變。' : '受害者是外部人員或不願具名時免填'} />
      <Textarea label="事件經過與處理" autosize minRows={4} maxLength={10000} value={d.detail} onChange={e => set({ detail: e.currentTarget.value })}
        description="發生時間與地點、加害者（姓名或特徵、內部或外部人員）、經過及已採取的處理措施。加密儲存，主管一律看不到。" />
      <div>
        <Text size="sm" fw={500} mb={6}>後續協助</Text>
        <Chip.Group multiple value={d.followUps} onChange={v => set({ followUps: v })}>
          <Group gap={6}>{withSaved(VIO_FOLLOW, incident?.followUps ?? []).map(f => <Chip key={f} value={f} size="xs">{f}</Chip>)}</Group>
        </Chip.Group>
      </div>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {error && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button loading={create.isPending || update.isPending} onClick={submit}>{incident ? '儲存' : '送出通報'}</Button>
      </Group>
    </Stack>
  );
}
