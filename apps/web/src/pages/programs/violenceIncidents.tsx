/* 不法侵害預防 · 事件通報與處理 (職護、職醫 only; managers never see incidents). */
import { Button, Card, Chip, Group, Modal, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { data, type Schemas } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { todayIso } from '../../cases';
import { employeeQuery } from '../../queries';
import { CardNote, problemText } from '../states';
import { DateField, dt, EmployeePicker, Kv, PersonLink, saveProblem, ToneBadge, useModalSize, useMySites, useSiteName } from './maternalViolenceCommon';
import { VIO_FOLLOW, VIO_INC_TYPES, type Incident } from './violence';
import { incidentsQuery, useIncidentStatus } from './violenceQueries';

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

export function ViolenceIncidentsTab({ incidents, onNotice }: { incidents: UseQueryResult<Incident[]>; onNotice: (text: string) => void }) {
  const siteName = useSiteName();
  const sites = useMySites();
  const victims = useVictims(incidents.data ?? []);
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = incidents.data?.find(i => i.id === viewingId) ?? null;
  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Text size="sm" c="dimmed">事件內容加密儲存，只有職護、職醫看得到。</Text>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating(true)} disabled={!sites.length}>新增事件通報</Button>
      </Group>
      {incidents.isPending ? <Skeleton h={200} /> : incidents.isError ? <CardNote>{problemText(incidents.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>發生日期</Table.Th><Table.Th>廠區</Table.Th><Table.Th>類型</Table.Th><Table.Th>受害員工</Table.Th><Table.Th>後續協助</Table.Th><Table.Th>狀態</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {incidents.data.map(i => (
                  <Table.Tr key={i.id}>
                    <Table.Td>{dt(i.occurredOn)}</Table.Td>
                    <Table.Td>{siteName(i.siteId)}</Table.Td>
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
          {incidents.data.length === 0 && <CardNote>目前沒有不法侵害事件通報。</CardNote>}
        </>
      )}
      <NewIncidentModal opened={creating} onClose={() => setCreating(false)} />
      <IncidentDetailModal incident={viewing} victims={victims} onClose={() => setViewingId(null)} onNotice={onNotice} />
    </Card>
  );
}

function IncidentDetailModal({ incident, victims, onClose, onNotice }: {
  incident: Incident | null; victims: Victims; onClose: () => void; onNotice: (text: string) => void;
}) {
  const siteName = useSiteName();
  const size = useModalSize('lg');
  const status = useIncidentStatus();
  const next = incident?.status === '結案' ? '處理中' : '結案';
  const close = () => { status.reset(); onClose(); };
  return (
    <Modal opened={!!incident} onClose={close} title="不法侵害事件" {...size}>
      {incident && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
            <Kv label="發生日期" value={dt(incident.occurredOn)} />
            <Kv label="廠區" value={siteName(incident.siteId)} />
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
              <Button variant="default" onClick={close}>關閉</Button>
              <Button variant={next === '結案' ? 'filled' : 'default'} loading={status.isPending}
                onClick={() => status.mutate({ id: incident.id, status: next }, { onSuccess: () => onNotice(next === '結案' ? '事件已結案。' : '事件已重新開啟，狀態為處理中。') })}>
                {next === '結案' ? '結案' : '重新開啟'}
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function NewIncidentModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={opened} onClose={onClose} title="新增不法侵害事件通報" {...size}>
      {opened && <NewIncidentForm onDone={onClose} />}
    </Modal>
  );
}

function NewIncidentForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const sites = useMySites();
  const today = todayIso();
  const [occurredOn, setOccurredOn] = useState(today);
  const [siteId, setSiteId] = useState<string | null>(sites[0]?.id ?? null);
  const [type, setType] = useState<string>('');
  const [victim, setVictim] = useState<Employee | null>(null);
  const [detail, setDetail] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const problem = !occurredOn ? '請填寫發生日期。' : occurredOn > today ? '發生日期不能晚於今天。' : !siteId ? '請選擇廠區。' : !type ? '請選擇不法侵害類型。' : null;
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/programs/violence/incidents', {
      body: { occurredOn, siteId: siteId!, type, victimEmployeeId: victim?.id ?? null, detail: detail.trim() || null, followUps },
    })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: incidentsQuery.queryKey }); onDone(); },
  });
  const pickVictim = (e: Employee | null) => {
    setVictim(e);
    if (e && sites.some(s => s.id === e.site.id)) setSiteId(e.site.id);
  };

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <DateField label="發生日期" required max={today} value={occurredOn} onChange={e => setOccurredOn(e.currentTarget.value)} />
        <Select label="廠區" required value={siteId} onChange={setSiteId} data={sites.map(s => ({ value: s.id, label: s.name }))} allowDeselect={false} />
      </SimpleGrid>
      <div>
        <Text size="sm" fw={500} mb={6}>不法侵害類型 <Text span c="var(--yutis-bad)">*</Text></Text>
        <Chip.Group value={type} onChange={v => setType(v as string)}>
          <Group gap={6}>{VIO_INC_TYPES.map(t => <Chip key={t} value={t} size="xs">{t}</Chip>)}</Group>
        </Chip.Group>
      </div>
      <EmployeePicker label="受害員工" description="受害者是外部人員或不願具名時免填" value={victim} onChange={pickVictim} />
      <Textarea label="事件經過與處理" autosize minRows={4} maxLength={10000} value={detail} onChange={e => setDetail(e.currentTarget.value)}
        description="發生時間與地點、加害者（姓名或特徵、內部或外部人員）、經過及已採取的處理措施。加密儲存，主管一律看不到。" />
      <div>
        <Text size="sm" fw={500} mb={6}>後續協助</Text>
        <Chip.Group multiple value={followUps} onChange={setFollowUps}>
          <Group gap={6}>{VIO_FOLLOW.map(f => <Chip key={f} value={f} size="xs">{f}</Chip>)}</Group>
        </Chip.Group>
      </div>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate(); }}>送出通報</Button>
      </Group>
    </Stack>
  );
}
