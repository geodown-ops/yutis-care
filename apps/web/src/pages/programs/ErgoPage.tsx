import {
  Alert, Anchor, Badge, Box, Button, Card, Checkbox, Chip, Grid, Group, Modal, Progress, ScrollArea, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, TagsInput,
  Text, Textarea, TextInput, Title,
} from '@mantine/core';
import { IconMailForward, IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { StatCard } from '@yutis/ui';
import { useState, type ReactNode } from 'react';
import { todayIso } from '../../cases';
import { AnchorLink, ButtonLink, splat } from '../../links';
import { canAccess } from '../../nav';
import { ergoDispatchesQuery } from '../../queries';
import { useMe } from '../../session';
import { when } from '../advice/InterviewFollowUp';
import { CardNote, problemText } from '../states';
import { programmeOptionsQuery } from './directory';
import {
  addDays, defaultDispatchName, dispatchTotals, draftMax, filterSurveys, hazardLabel, hazardParts, isSuspected, nmqBody, nmqDraftFrom, nmqUnanswered,
  NMQ_ROWS, NMQ_SCALE, NMQ_YES_NO, splitMeasures, SURVEY_FILTERS, surveyColumns, trackingBody, trackingDraft, trackingProblem, TRACKING_STATUSES, TRACKING_TONE,
  type Dispatch, type NmqDraft, type Survey, type SurveyFilter, type TrackingDraft,
} from './ergo';
import { ergoSurveysQuery, useCreateDispatch, useFillNmq, useRemindSurveys, useSaveTracking } from './ergoQueries';
import { EmployeePicker } from './ergoWorkloadPicker';
import { ExportButton, OrgFilterSelects, RemindModal } from './listControls';
import { downloadCsv, NO_ORG_FILTER, rowNames, type OrgFilter } from './lists';
import { saveProblem, useModalSize } from './maternalViolenceCommon';

const dt = (iso: string) => iso.slice(0, 10).replaceAll('-', '/');
const tone = (t: 'ok' | 'warn' | 'bad' | 'info') => ({ root: { background: `var(--yutis-${t}-weak)`, color: `var(--yutis-${t})`, textTransform: 'none' as const } });

/** 人因性危害預防: NMQ batches, each batch's answers, and 職護代填. Clinical staff only (the route checks first). */
export function ErgoPage({ dispatchId, onDispatch }: { dispatchId?: string; onDispatch: (id: string | undefined) => void }) {
  const today = todayIso();
  const { data: dispatches } = useSuspenseQuery(ergoDispatchesQuery);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const totals = dispatchTotals(dispatches, today);
  const current = dispatches.find(d => d.id === dispatchId) ?? dispatches[0];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>人因性危害預防</Title>
          <Text c="dimmed" size="sm" mt={4}>發送肌肉骨骼症狀調查（NMQ），任一部位 3 分以上判定為疑似有危害，並列入個案管理。</Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>發送問卷</Button>
      </Group>

      {notice && <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} closeButtonLabel="關閉">{notice}</Alert>}

      <Card>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <StatCard tone="blue" label="待填寫" value={totals.pending} note={totals.overdue ? `${totals.overdue} 批已過期限` : totals.dueSoon ? `${totals.dueSoon} 批 3 天內到期` : undefined} />
          <StatCard tone="mint" label="已填寫" value={totals.filled} note={totals.total ? `填答率 ${Math.round((totals.filled / totals.total) * 100)}%` : undefined} />
          <StatCard tone="pink" label="疑似有危害" value={totals.suspected} note="任一部位 ≥ 3 分" />
          <StatCard tone="lavender" label="調查批次" value={totals.batches} />
        </SimpleGrid>
      </Card>

      {dispatches.length === 0 ? (
        <Card><CardNote>還沒有發送過問卷。按「發送問卷」選擇要調查的員工。</CardNote></Card>
      ) : (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card>
              <Text fw={600} mb="sm">調查批次</Text>
              <Stack gap={6}>
                {dispatches.map(d => <DispatchItem key={d.id} d={d} active={d.id === current?.id} today={today} onClick={() => onDispatch(d.id)} />)}
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 8 }}>
            {current && <SurveysCard key={current.id} dispatch={current} today={today} onSaved={setNotice} />}
          </Grid.Col>
        </Grid>
      )}

      <DispatchModal opened={creating} onClose={() => setCreating(false)} today={today}
        onCreated={d => { setCreating(false); onDispatch(d.id); setNotice(`已發送 ${d.total} 份問卷，員工會在員工端看到待填問卷。`); }} />
    </Stack>
  );
}

function DispatchItem({ d, active, today, onClick }: { d: Dispatch; active: boolean; today: string; onClick: () => void }) {
  const open = d.total - d.filled;
  const late = !!d.dueOn && open > 0 && d.dueOn < today;
  return (
    <Box p="sm" onClick={onClick} role="button" tabIndex={0} aria-pressed={active} onKeyDown={k => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-md)', background: active ? 'var(--yutis-tile-lavender)' : 'var(--yutis-surface2)' }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fw={600} lineClamp={1}>{d.name}</Text>
        {d.suspected > 0 && <Badge size="sm" styles={tone('bad')}>疑似 {d.suspected}</Badge>}
      </Group>
      <Text size="xs" c={late ? 'var(--yutis-bad)' : 'dimmed'}>
        {dt(d.sentOn)} 發送{d.dueOn ? ` · ${dt(d.dueOn)} 截止` : ''}{late ? ' · 已過期限' : ''}
      </Text>
      <Group gap="xs" mt={6} wrap="nowrap">
        <Progress value={d.total ? (d.filled / d.total) * 100 : 0} size="sm" style={{ flex: 1 }} aria-label={`已填寫 ${d.filled} / ${d.total}`} />
        <Text size="xs" c="dimmed">{d.filled}/{d.total}</Text>
      </Group>
    </Box>
  );
}

function SurveysCard({ dispatch, today, onSaved }: { dispatch: Dispatch; today: string; onSaved: (msg: string) => void }) {
  const surveys = useQuery(ergoSurveysQuery(dispatch.id));
  const remind = useRemindSurveys(dispatch.id);
  const [filter, setFilter] = useState<SurveyFilter>('all');
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [q, setQ] = useState('');
  const [filling, setFilling] = useState<Survey | null>(null);
  const [tracking, setTracking] = useState<Survey | null>(null);
  const [reminding, setReminding] = useState(false);
  const rows = surveys.data ? filterSurveys(surveys.data, filter, q, org) : [];
  const unfilled = rows.filter(s => s.status === '未填寫');

  return (
    <Card>
      <Group justify="space-between" mb="sm" align="flex-start">
        <div>
          <Text fw={600}>{dispatch.name}</Text>
          <Text size="xs" c="dimmed">{dt(dispatch.sentOn)} 發送{dispatch.dueOn ? ` · ${dt(dispatch.dueOn)} 截止` : ''} · 已填寫 {dispatch.filled}/{dispatch.total}</Text>
        </div>
        <Group gap="xs">
          <Button size="xs" variant="default" leftSection={<IconMailForward size={14} />} disabled={!unfilled.length} onClick={() => setReminding(true)}>
            未填寫通知{unfilled.length ? `（${unfilled.length}）` : ''}
          </Button>
          <ExportButton count={rows.length} onExport={() => downloadCsv(`${dispatch.name}_${today}.csv`, surveyColumns(dispatch), rows)} />
        </Group>
      </Group>
      <Group gap="sm" mb="sm" justify="space-between">
        <Group gap="sm">
          <SegmentedControl size="xs" value={filter} onChange={v => setFilter(v as SurveyFilter)} data={SURVEY_FILTERS} aria-label="填答狀況" />
          <OrgFilterSelects rows={surveys.data ?? []} names={rowNames(surveys.data ?? [])} value={org} onChange={setOrg} />
        </Group>
        <TextInput size="xs" aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={14} />} w={180} value={q} onChange={e => setQ(e.currentTarget.value)} />
      </Group>
      {surveys.isPending ? <Skeleton h={240} /> : surveys.isError ? <CardNote>{problemText(surveys.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>員工</Table.Th><Table.Th>部門</Table.Th><Table.Th>填寫狀況</Table.Th><Table.Th>危害判定</Table.Th><Table.Th>管控追蹤</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(s => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <AnchorLink to="/employees/$employeeId" params={{ employeeId: s.employeeId }} fw={600}>{s.name}</AnchorLink>
                      <Text size="xs" c="dimmed" ff="monospace">{s.empNo}</Text>
                    </Table.Td>
                    <Table.Td><Text size="sm">{s.department}</Text><Text size="xs" c="dimmed">{s.site}</Text></Table.Td>
                    <Table.Td>
                      {s.status === '已填寫' ? (
                        <><Text size="sm">已填寫</Text><Text size="xs" c="dimmed">{s.filledAt ? dt(s.filledAt) : ''} · {s.filledBy === 'nurse' ? '職護代填' : '本人填寫'}</Text></>
                      ) : (
                        <>
                          <Badge styles={tone('warn')}>未填寫</Badge>
                          {s.reminders > 0 && <Text size="xs" c="dimmed" mt={2} title={s.lastRemindedAt ? `最近一次 ${when(s.lastRemindedAt)}` : undefined}>已催填 {s.reminders} 次</Text>}
                        </>
                      )}
                    </Table.Td>
                    <Table.Td>{s.status === '已填寫' ? <Badge styles={tone(isSuspected(s.maxScore) ? 'bad' : 'ok')}>{hazardLabel(s.maxScore)}</Badge> : <Text c="dimmed">—</Text>}</Table.Td>
                    <Table.Td>
                      {!s.suspectedHazard ? <Text c="dimmed">—</Text> : s.tracking ? (
                        <Group gap={6} wrap="nowrap">
                          <Badge styles={tone(TRACKING_TONE[s.tracking.status])}>{s.tracking.status}</Badge>
                          <Anchor component="button" type="button" size="sm" onClick={() => setTracking(s)} aria-label={`編輯 ${s.name} 的管控追蹤`}>編輯</Anchor>
                        </Group>
                      ) : <Button size="compact-xs" variant="light" onClick={() => setTracking(s)} aria-label={`列管 ${s.name}`}>列管</Button>}
                      {s.tracking?.nextOn && s.tracking.status === '列管中' && <Text size="xs" c={s.tracking.nextOn < today ? 'var(--yutis-bad)' : 'dimmed'}>下次追蹤 {dt(s.tracking.nextOn)}</Text>}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button size="xs" variant={s.status === '未填寫' ? 'filled' : 'default'} onClick={() => setFilling(s)}>{s.status === '未填寫' ? '代填' : '重新填寫'}</Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{surveys.data.length === 0 ? '這批問卷沒有你負責廠區的員工。' : '沒有符合條件的問卷。'}</CardNote>}
          {dispatch.dueOn && dispatch.dueOn < today && dispatch.filled < dispatch.total && <Text size="xs" c="dimmed" mt="xs">填寫期限已過，仍可由職護代填。</Text>}
        </>
      )}
      <NmqModal survey={filling} dispatchId={dispatch.id} onClose={() => setFilling(null)}
        onSaved={s => { setFilling(null); onSaved(s.suspectedHazard ? `已儲存 ${s.name} 的問卷：${hazardLabel(s.maxScore)}，已列入個案管理。` : `已儲存 ${s.name} 的問卷：無明顯危害。`); }} />
      <TrackingModal survey={tracking} dispatchId={dispatch.id} today={today} onClose={() => setTracking(null)}
        onSaved={s => { setTracking(null); onSaved(`已儲存 ${s.name} 的管控追蹤：${s.tracking?.status ?? ''}。`); }} />
      <RemindModal opened={reminding} rows={unfilled} what="肌肉骨骼症狀調查" send={remind} onClose={() => setReminding(false)}
        onDone={text => { setReminding(false); onSaved(text); }} />
    </Card>
  );
}

/** 管控追蹤 for a suspected hazard: improvement measures, a note, the next follow-up and whether it is still tracked. */
function TrackingModal({ survey, dispatchId, today, onClose, onSaved }: {
  survey: Survey | null; dispatchId: string; today: string; onClose: () => void; onSaved: (s: Survey) => void;
}) {
  const size = useModalSize('md');
  return (
    <Modal opened={!!survey} onClose={onClose} title={survey ? `管控追蹤 · ${survey.name}` : ''} {...size}>
      {survey && <TrackingForm key={survey.id} survey={survey} dispatchId={dispatchId} today={today} onCancel={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function TrackingForm({ survey, dispatchId, today, onCancel, onSaved }: {
  survey: Survey; dispatchId: string; today: string; onCancel: () => void; onSaved: (s: Survey) => void;
}) {
  const [d, setD] = useState<TrackingDraft>(() => trackingDraft(survey.tracking, today));
  const [tried, setTried] = useState(false);
  const save = useSaveTracking(dispatchId);
  const options = useQuery(programmeOptionsQuery);
  const problem = trackingProblem(d);
  const parts = hazardParts(survey.answers);
  const measures = options.data?.ergoMeasures ?? [];
  const { listed, others } = splitMeasures(d.measures, measures);
  const set = (patch: Partial<TrackingDraft>) => setD(x => ({ ...x, ...patch }));
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">{survey.department} · {hazardLabel(survey.maxScore)}{parts ? `：${parts}` : ''}</Text>
      {options.isPending ? <Skeleton h={96} /> : options.isError ? <Text size="sm" c="var(--yutis-bad)">{problemText(options.error)}</Text> : (
        <Checkbox.Group label="改善措施" value={listed} onChange={v => setD(x => ({ ...x, measures: [...v, ...splitMeasures(x.measures, measures).others] }))}>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing={8} mt={8}>{measures.map(m => <Checkbox key={m} value={m} label={m} />)}</SimpleGrid>
        </Checkbox.Group>
      )}
      <TagsInput label="其他改善措施" placeholder="輸入後按 Enter" value={others} maxTags={20 - listed.length} disabled={options.isPending}
        onChange={v => setD(x => ({ ...x, measures: [...splitMeasures(x.measures, measures).listed, ...v] }))} />
      <Textarea label="說明" autosize minRows={3} maxLength={2000} value={d.note} onChange={e => set({ note: e.currentTarget.value })} />
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <TextInput type="date" label="下次追蹤日期" value={d.nextOn} onChange={e => set({ nextOn: e.currentTarget.value })} />
        <Select label="列管狀態" data={[...TRACKING_STATUSES]} value={d.status} allowDeselect={false} onChange={v => v && setD(x => ({ ...x, status: v as TrackingDraft['status'] }))} />
      </SimpleGrid>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate({ surveyId: survey.id, body: trackingBody(d) }, { onSuccess: onSaved }); }}>儲存</Button>
      </Group>
    </Stack>
  );
}

/** 職護代填, and re-entry starting from the earlier answers. */
function NmqModal({ survey, dispatchId, onClose, onSaved }: { survey: Survey | null; dispatchId: string; onClose: () => void; onSaved: (s: Survey) => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={!!survey} onClose={onClose} title={survey ? `肌肉骨骼症狀調查 · ${survey.name}` : ''} {...size} scrollAreaComponent={ScrollArea.Autosize}>
      {survey && <NmqForm key={survey.id} survey={survey} dispatchId={dispatchId} onCancel={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function NmqForm({ survey, dispatchId, onCancel, onSaved }: { survey: Survey; dispatchId: string; onCancel: () => void; onSaved: (s: Survey) => void }) {
  const [draft, setDraft] = useState<NmqDraft>(() => nmqDraftFrom(survey.answers));
  const fill = useFillNmq(dispatchId);
  const left = nmqUnanswered(draft);
  const max = draftMax(draft);
  const body = nmqBody(draft);
  const setScore = (key: string, v: string | null) => setDraft(d => {
    const scores = { ...d.scores };
    if (v == null) delete scores[key]; else scores[key] = Number(v);
    return { ...d, scores };
  });

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {survey.status === '未填寫'
          ? '依員工口述填寫，填寫方式會記錄為「職護代填」。'
          : `${survey.filledAt ? dt(survey.filledAt) : ''} ${survey.filledBy === 'nurse' ? '職護代填' : '本人填寫'}，${hazardLabel(survey.maxScore)}。`
            + (survey.answers ? '已帶入原本的作答；修改後儲存會取代原結果並重新判定。' : '重新填寫會取代原結果並重新判定。')}
      </Text>
      {NMQ_YES_NO.map(q => (
        <div key={q.key}>
          <Text size="sm" fw={600} mb={6}>{q.label}</Text>
          <Chip.Group value={draft.yesNo[q.key] == null ? null : draft.yesNo[q.key] ? 'y' : 'n'} onChange={v => setDraft(d => ({ ...d, yesNo: { ...d.yesNo, [q.key]: v === 'y' } }))}>
            <Group gap={6}><Chip value="y" size="sm">是</Chip><Chip value="n" size="sm">否</Chip></Group>
          </Chip.Group>
        </div>
      ))}
      <div>
        <Text size="sm" fw={600}>各部位不適程度（0–5）</Text>
        <Text size="xs" c="dimmed" mb="xs">{NMQ_SCALE.map((s, i) => `${i} ${s}`).join('　')}</Text>
        <Stack gap={0}>
          {NMQ_ROWS.map((row, i) => (
            <Group key={row.label} gap="sm" py={8} wrap="wrap" align="center" style={{ borderTop: i ? '1px solid var(--yutis-line)' : undefined }}>
              <Text size="sm" fw={500} w={88}>{row.label}</Text>
              <Group gap="md" wrap="wrap">
                {row.keys.map(k => (
                  <Group key={k.key} gap={6} wrap="nowrap">
                    {k.side && <Text size="xs" c="dimmed" w={14}>{k.side}</Text>}
                    <Chip.Group value={draft.scores[k.key] == null ? null : String(draft.scores[k.key])} onChange={v => setScore(k.key, v)}>
                      <Group gap={4} wrap="nowrap" role="radiogroup" aria-label={`${row.label}${k.side ? `（${k.side}）` : ''}`}>
                        {NMQ_SCALE.map((_, n) => <Chip key={n} value={String(n)} size="xs" icon={null} styles={{ label: { paddingInline: 10 } }}>{n}</Chip>)}
                      </Group>
                    </Chip.Group>
                  </Group>
                ))}
              </Group>
            </Group>
          ))}
        </Stack>
      </div>
      <Box p="sm" style={{ background: max != null && isSuspected(max) ? 'var(--yutis-bad-weak)' : 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
        <Text size="sm">{left ? `還有 ${left} 題未回答` : '已全部回答'}{max != null ? ` · 目前最高 ${max} 分，${hazardLabel(max)}` : ''}</Text>
      </Box>
      {fill.isError && <Text size="sm" c="var(--yutis-bad)">{problemText(fill.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button disabled={!body} loading={fill.isPending} onClick={() => body && fill.mutate({ surveyId: survey.id, body }, { onSuccess: onSaved })}>儲存</Button>
      </Group>
    </Stack>
  );
}

function DispatchModal({ opened, onClose, onCreated, today }: { opened: boolean; onClose: () => void; onCreated: (d: Dispatch) => void; today: string }) {
  return (
    <Modal opened={opened} onClose={onClose} title="發送問卷：肌肉骨骼症狀調查" size="xl" scrollAreaComponent={ScrollArea.Autosize}>
      {opened && <DispatchForm today={today} onCancel={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function DispatchForm({ today, onCancel, onCreated }: { today: string; onCancel: () => void; onCreated: (d: Dispatch) => void }) {
  const [name, setName] = useState(defaultDispatchName(today));
  const [sentOn, setSentOn] = useState(today);
  const [dueOn, setDueOn] = useState(addDays(today, 14));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const create = useCreateDispatch();
  const problem = !name.trim() ? '請填批次名稱' : !sentOn ? '請填發送日期' : dueOn && dueOn < sentOn ? '填寫期限不能早於發送日期' : !picked.size ? '請勾選要調查的員工' : null;

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <TextInput label="批次名稱" required value={name} onChange={e => setName(e.currentTarget.value)} maxLength={100} />
        <TextInput label="發送日期" type="date" required value={sentOn} onChange={e => setSentOn(e.currentTarget.value)} />
        <TextInput label="填寫期限（可留白）" type="date" value={dueOn} onChange={e => setDueOn(e.currentTarget.value)} />
      </SimpleGrid>
      <EmployeePicker selected={picked} onChange={setPicked} />
      <Text size="xs" c="dimmed">員工會在員工端看到待填問卷，並以自己設定的語言填寫；也可以由職護代填。</Text>
      {create.isError && <Text size="sm" c="var(--yutis-bad)">{problemText(create.error)}</Text>}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{problem ?? `將發送給 ${picked.size} 人`}</Text>
        <Group gap="sm">
          <Button variant="default" onClick={onCancel}>取消</Button>
          <Button disabled={!!problem} loading={create.isPending}
            onClick={() => create.mutate({ name: name.trim(), sentOn, dueOn: dueOn || null, employeeIds: [...picked] }, { onSuccess: onCreated })}>發送問卷</Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** For roles that hold the programmes menu but not this programme's records (and for direct links). */
export function NoProgrammeAccess({ title, children }: { title: string; children: ReactNode }) {
  const me = useMe();
  // Statistics are de-identified and open to 職安衛人員 and 人資 (ReportAccess in apps/api/src/reports/reports.controller.ts).
  const reports = canAccess(me, { feature: 'reports', roles: ['職護', '職醫', '職安衛人員', '人資'] });
  return (
    <Stack gap="lg" maw={640}>
      <Title order={2}>{title}</Title>
      <Card>
        <Stack gap="sm" align="flex-start">
          <Text>{children}</Text>
          {reports ? <ButtonLink {...splat('/reports')} variant="light">查看統計報表</ButtonLink> : <ButtonLink to="/" variant="light">回首頁</ButtonLink>}
        </Stack>
      </Card>
    </Stack>
  );
}
