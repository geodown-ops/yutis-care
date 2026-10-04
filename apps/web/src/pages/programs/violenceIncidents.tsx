/* 不法侵害預防 · 事件通報與處理 (職護、職醫 only; managers never see incidents). */
import { Button, Card, Chip, Grid, Group, Input, Modal, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { Schemas } from '@yutis/api-client';
import { useState, type ReactNode } from 'react';
import { todayIso } from '../../cases';
import { employeeQuery } from '../../queries';
import { useMe } from '../../session';
import { CardNote, problemText } from '../states';
import { OrgFilterSelects } from './listControls';
import { matchOrg, NO_ORG_FILTER, withRowDepartments, type OrgFilter } from './lists';
import {
  DateField, DepartmentSelect, EmployeePicker, Kv, PersonLink, saveProblem, ToneBadge, useModalSize, useMySites, useOrgNames, useSiteName,
} from './maternalViolenceCommon';
import {
  incidentBody, incidentDraft, incidentPatch, incidentProblem, nowTime, occurredText, parseDetail, PERSON_KINDS, pickSite, pickVictim, receivedText,
  VIO_FOLLOW, VIO_INC_TYPES, withSaved, type Incident, type IncidentDraft, type PersonKind,
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

function Victim({ id, victims }: { id: string; victims: Victims }) {
  const e = victims.get(id);
  if (!e || e === 'loading') return <Text span size="sm" c="dimmed">…</Text>;
  if (e === 'unavailable') return <Text span size="sm" c="dimmed">無法顯示</Text>;
  return <PersonLink employeeId={id} name={e.name} empNo={e.empNo} />;
}

const Dim = ({ children }: { children: string }) => <Text span size="sm" c="dimmed">{children}</Text>;

/** A table cell's main line with a smaller one under it. */
function TwoLines({ main, sub }: { main: ReactNode; sub: string | null }) {
  return (
    <Stack gap={0}>
      <Text size="sm" component="div">{main}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Stack>
  );
}

/** A heading over a hairline, as the report's sections are set out. */
function SectionHead({ children, note }: { children: string; note?: string }) {
  return (
    <Group justify="space-between" align="flex-end" gap="sm" pb={6} mb="sm" style={{ borderBottom: '1px solid var(--yutis-line)' }}>
      <Text fw={600} size="sm">{children}</Text>
      {note && <Text size="xs" c="dimmed">{note}</Text>}
    </Group>
  );
}

/** Text of several lines in the record view. */
function Long({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" c={text ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text || '未填寫'}</Text>
    </div>
  );
}

const statusBadge = (s: Incident['status']) => <ToneBadge tone={s === '結案' ? 'ok' : 'warn'}>{s}</ToneBadge>;

export function ViolenceIncidentsTab({ incidents, onNotice }: { incidents: UseQueryResult<Incident[]>; onNotice: (text: string) => void }) {
  const names = withRowDepartments(useOrgNames(), incidents.data ?? []);
  const sites = useMySites();
  const victims = useVictims(incidents.data ?? []);
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = incidents.data?.find(i => i.id === viewingId) ?? null;
  // In the API's order: newest first by date and time.
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
          <Table.ScrollContainer minWidth={1040}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>發生時間</Table.Th><Table.Th>廠區／部門</Table.Th><Table.Th>發生地點</Table.Th><Table.Th>類型</Table.Th><Table.Th>受害者</Table.Th>
                  <Table.Th>加害者</Table.Th><Table.Th>受理時間／受理人</Table.Th><Table.Th>狀態</Table.Th><Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(i => {
                  const { story } = parseDetail(i.detail);
                  return (
                    <Table.Tr key={i.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{occurredText(i)}</Table.Td>
                      <Table.Td><TwoLines main={names.site(i.siteId)} sub={i.departmentName} /></Table.Td>
                      <Table.Td maw={200} style={{ overflowWrap: 'anywhere' }}>{i.place ?? <Dim>—</Dim>}</Table.Td>
                      <Table.Td><ToneBadge tone="bad">{i.type}</ToneBadge></Table.Td>
                      <Table.Td>
                        <TwoLines sub={i.victimKind}
                          main={i.victimEmployeeId ? <Victim id={i.victimEmployeeId} victims={victims} /> : story.victimName || <Dim>未填</Dim>} />
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{i.perpetratorKind ?? <Dim>未填</Dim>}</Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}><TwoLines main={receivedText(i.receivedAt)} sub={i.receiverName} /></Table.Td>
                      <Table.Td>{statusBadge(i.status)}</Table.Td>
                      <Table.Td ta="right"><Button variant="default" size="xs" onClick={() => setViewingId(i.id)}>檢視</Button></Table.Td>
                    </Table.Tr>
                  );
                })}
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
    <Modal opened={!!incident} onClose={close} title={editing ? '編輯事件通報與處理' : '事件通報與處理'} {...size}>
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
  const { story, legacy } = parseDetail(incident.detail);
  const orBlank = (v: string | null) => v || <Dim>未填寫</Dim>;
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <Kv label="發生時間" value={occurredText(incident)} />
        <Kv label="不法侵害類型" value={<ToneBadge tone="bad">{incident.type}</ToneBadge>} />
        <Kv label="狀態" value={statusBadge(incident.status)} />
        <Kv label="廠區" value={siteName(incident.siteId)} />
        <Kv label="部門" value={incident.departmentName ?? <Dim>未指定</Dim>} />
        <Kv label="發生地點" value={orBlank(incident.place)} />
        <Kv label="受理時間" value={receivedText(incident.receivedAt)} />
        <Kv label="受理人" value={orBlank(incident.receiverName)} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <div>
          <SectionHead>受害者</SectionHead>
          <SimpleGrid cols={2} spacing="sm">
            <Kv label="人員類別" value={orBlank(incident.victimKind)} />
            {incident.victimEmployeeId && <Kv label="受害員工" value={<Victim id={incident.victimEmployeeId} victims={victims} />} />}
            {/* With the employee shown, a blank name says nothing more. */}
            {!legacy && (story.victimName || !incident.victimEmployeeId) && <Kv label="姓名或特徵" value={orBlank(story.victimName)} />}
          </SimpleGrid>
        </div>
        <div>
          <SectionHead>加害者</SectionHead>
          <SimpleGrid cols={2} spacing="sm">
            <Kv label="人員類別" value={orBlank(incident.perpetratorKind)} />
            {!legacy && <Kv label="姓名或特徵" value={orBlank(story.perpetratorName)} />}
          </SimpleGrid>
        </div>
      </SimpleGrid>
      <div>
        <SectionHead note="加密儲存">事件經過與處理</SectionHead>
        <Stack gap="sm">
          {legacy ? <Long label="事件經過與處理" text={story.cause} /> : (
            <>
              <Long label="受害者及加害者關係" text={story.relation} />
              <Long label="發生原因及過程" text={story.cause} />
              <Long label="處理措施" text={story.handling} />
            </>
          )}
          <Kv label="後續協助" value={incident.followUps.join('、') || <Dim>無</Dim>} />
        </Stack>
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
    <Modal opened={opened} onClose={onClose} title="新增事件通報與處理" {...size}>
      {opened && <IncidentForm incident={null} onCancel={onClose} onSaved={onClose} />}
    </Modal>
  );
}

/** 內部人員 or 外部人員; picking the chosen one again clears it (the API takes none). */
function KindChips({ party, value, onChange }: { party: string; value: PersonKind | null; onChange: (k: PersonKind | null) => void }) {
  return (
    <Input.Wrapper label="人員類別" labelElement="div">
      <Group gap={6} mt={4} role="group" aria-label={`${party}人員類別`}>
        {PERSON_KINDS.map(k => <Chip key={k} size="xs" checked={value === k} onChange={() => onChange(value === k ? null : k)}>{k}</Chip>)}
      </Group>
    </Input.Wrapper>
  );
}

/**
 * A new report (POST) or an edit (PATCH with only what changed), laid out as the prototype's 事件通報與處理. Names,
 * relationship, what happened and the handling are written into the encrypted detail as labelled parts. The
 * department is one of the chosen site's; another site clears it, and an edit that moves the site sends the new
 * department (or none) with it.
 */
function IncidentForm({ incident, savedVictim, onCancel, onSaved }: {
  incident: Incident | null; savedVictim?: VictimState; onCancel: () => void; onSaved: (changed: boolean) => void;
}) {
  const me = useMe();
  const sites = useMySites();
  const today = todayIso();
  const [d, setD] = useState<IncidentDraft>(() => incidentDraft(incident, { today, siteId: sites[0]?.id ?? null }));
  const [legacy] = useState(() => parseDetail(incident?.detail ?? null).legacy);
  const [victim, setVictim] = useState<Employee | null>(typeof savedVictim === 'object' ? savedVictim : null);
  const [tried, setTried] = useState(false);
  const create = useCreateIncident();
  const update = useUpdateIncident();
  const problem = incidentProblem(d, today, nowTime());
  const error = create.error ?? update.error;
  const set = (patch: Partial<IncidentDraft>) => setD(x => ({ ...x, ...patch }));
  const text = (key: keyof IncidentDraft) => (e: { currentTarget: { value: string } }) => set({ [key]: e.currentTarget.value });
  // A victim on record whose employee file cannot be shown stays unless another is picked.
  const hiddenVictim = !!incident?.victimEmployeeId && !victim && d.victimEmployeeId === incident.victimEmployeeId;

  const choose = (e: Employee | null) => {
    setVictim(e);
    // A new report follows the victim to their site, when it is one of mine.
    setD(x => pickVictim(x, e && { id: e.id, siteId: e.site.id }, !incident && !!e && sites.some(s => s.id === e.site.id)));
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
    <Stack gap="lg">
      <div>
        <SectionHead>通報內容</SectionHead>
        <Grid gap="sm">
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <DateField label="發生日期" required max={today} value={d.occurredOn} onChange={text('occurredOn')} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="發生時間" type="time" value={d.occurredTime} onChange={text('occurredTime')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select label="廠區" required value={d.siteId} onChange={v => setD(x => pickSite(x, v))} data={sites.map(s => ({ value: s.id, label: s.name }))}
              allowDeselect={false} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <DepartmentSelect siteId={d.siteId} value={d.departmentId} onChange={v => set({ departmentId: v })} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="發生地點" placeholder="例如：客服中心 1F 服務櫃台" maxLength={100} value={d.place} onChange={text('place')} />
          </Grid.Col>
        </Grid>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <div>
          <SectionHead>受害者</SectionHead>
          <Stack gap="sm">
            <KindChips party="受害者" value={d.victimKind} onChange={k => set({ victimKind: k })} />
            {d.victimKind !== '外部人員' && (
              <EmployeePicker label="受害員工" value={victim} onChange={choose}
                description={hiddenVictim ? '這裡無法顯示原受害員工；不重新選擇就維持不變。' : '受害者是本公司員工時選擇'} />
            )}
            <TextInput label="姓名或特徵" maxLength={200} value={d.victimName} onChange={text('victimName')}
              description={d.victimKind === '外部人員' ? undefined : '已選員工或不願具名時可免填'} />
          </Stack>
        </div>
        <div>
          <SectionHead>加害者</SectionHead>
          <Stack gap="sm">
            <KindChips party="加害者" value={d.perpetratorKind} onChange={k => set({ perpetratorKind: k })} />
            <TextInput label="姓名或特徵" placeholder="例如：男性客戶，約 50 歲" maxLength={200} value={d.perpetratorName} onChange={text('perpetratorName')} />
          </Stack>
        </div>
      </SimpleGrid>
      <div>
        <SectionHead note="雙方姓名、關係、經過與處理加密儲存，主管一律看不到">事件經過與處理</SectionHead>
        <Stack gap="sm">
          <Textarea label="受害者及加害者關係" autosize minRows={2} maxLength={500} value={d.relation} onChange={text('relation')} />
          <Textarea label="發生原因及過程" autosize minRows={4} maxLength={10000} value={d.cause} onChange={text('cause')}
            description={legacy ? '這筆通報建立時還沒有分欄，原本的內容都在這裡，可以再分到各欄位。' : undefined} />
          <Input.Wrapper label="不法侵害類型" required labelElement="div">
            <Chip.Group value={d.type} onChange={v => set({ type: v as string })}>
              <Group gap={6} mt={4}>{withSaved(VIO_INC_TYPES, incident ? [incident.type] : []).map(t => <Chip key={t} value={t} size="xs">{t}</Chip>)}</Group>
            </Chip.Group>
          </Input.Wrapper>
          <Textarea label="處理措施" autosize minRows={3} maxLength={5000} value={d.handling} onChange={text('handling')} />
          <Input.Wrapper label="後續協助" labelElement="div">
            <Chip.Group multiple value={d.followUps} onChange={v => set({ followUps: v })}>
              <Group gap={6} mt={4}>{withSaved(VIO_FOLLOW, incident?.followUps ?? []).map(f => <Chip key={f} value={f} size="xs">{f}</Chip>)}</Group>
            </Chip.Group>
          </Input.Wrapper>
        </Stack>
      </div>
      <SimpleGrid cols={2} spacing="sm">
        <Kv label="受理人" value={incident ? incident.receiverName || <Dim>未填寫</Dim> : me.name} />
        <Kv label="受理時間" value={incident ? receivedText(incident.receivedAt) : <Dim>送出通報時記錄</Dim>} />
      </SimpleGrid>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {error && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button loading={create.isPending || update.isPending} onClick={submit}>{incident ? '儲存' : '送出通報'}</Button>
      </Group>
    </Stack>
  );
}
