import {
  Alert, Anchor, Badge, Box, Button, Card, Checkbox, Chip, Grid, Group, Input, Modal, NumberInput, Progress, ScrollArea, SegmentedControl, Select, SimpleGrid, Skeleton,
  Stack, Table, Tabs, TagsInput, Text, Textarea, TextInput, Title,
} from '@mantine/core';
import { IconMailForward, IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { WORK_PATTERNS } from '@yutis/domain';
import { StatCard } from '@yutis/ui';
import { useState, type ReactNode } from 'react';
import { todayIso } from '../../cases';
import { AnchorLink } from '../../links';
import { workAdviceQuery, workloadAssessmentsQuery } from '../../queries';
import { useMe } from '../../session';
import { ACK_LABEL, ACK_TONE, ackState, workloadNoticeText } from '../advice/advice';
import { InterviewFollowUp, when } from '../advice/InterviewFollowUp';
import { CardNote, problemText } from '../states';
import { doctorsQuery } from './directory';
import { addDays } from './ergo';
import { EmployeePicker } from './ergoWorkloadPicker';
import { ExportButton, OrgFilterSelects, RemindModal } from './listControls';
import { downloadCsv, NO_ORG_FILTER, type OrgFilter } from './lists';
import { saveProblem, ToneBadge, useModalSize } from './maternalViolenceCommon';
import {
  ADJUST_HOURS, adviceSummary, ASSESS_COLUMNS, batchLog, burnoutLabel, canSchedule, cbiAnswered, cbiDraftFrom, cbiResult, CBI_PERSONAL, CBI_FREQ, CBI_WORK, CHANGE_WORK,
  DIAGNOSIS, FATIGUE, filterAssessments, FITNESS, GUIDANCE, interviewBody, interviewDone, interviewDraft, interviewProblems, interviewRows, INTERVIEW_STATUSES,
  MENTAL_CONCERN, missingSteps, noRiskReason, openAssessmentEmployees, readEvaluation, remindable, riskLevelOf, workloadCounts,
  type Assessment, type CbiDraft, type Interview, type InterviewDraft, type InterviewFilter, type InterviewStatus, type RiskFilter,
} from './workload';
import { LoadBadge, RiskBadge, WorkloadMatrix } from './workloadMatrix';
import { assessmentDetailQuery, patchInterview, useCreateAssessments, useRemindAssessments, useSaveStep, useScheduleInterviews } from './workloadQueries';

export type WorkloadTab = 'assess' | 'interview' | 'log';

const dt = (iso: string) => iso.slice(0, 10).replaceAll('-', '/');
const tone = (t: 'ok' | 'warn' | 'bad' | 'info') => ({ root: { background: `var(--yutis-${t}-weak)`, color: `var(--yutis-${t})`, textTransform: 'none' as const } });
const IV_TONE: Record<InterviewStatus, 'ok' | 'warn' | 'bad' | 'info'> = { 待安排: 'warn', 已安排: 'info', 已面談: 'ok', 拒絕面談: 'bad' };
const IV_SHORT: Record<InterviewStatus, string> = { 待安排: '面談待安排', 已安排: '面談已安排', 已面談: '已面談', 拒絕面談: '拒絕面談' };
const RISK_FILTERS: { value: RiskFilter; label: string }[] = [
  { value: 'all', label: '全部' }, { value: '2', label: '高度' }, { value: '1', label: '中度' }, { value: '0', label: '低度' }, { value: 'incomplete', label: '未完成' },
];

type Dialog = { kind: 'cbi' | 'overload' | 'risk' | 'interview'; id: string } | { kind: 'dispatch' | 'schedule' };

/** 異常工作負荷促發疾病預防 for 職護 and 職醫: questionnaires, the risk matrix and physician interviews. */
export function WorkloadPage({ tab, onTab }: { tab: WorkloadTab; onTab: (t: WorkloadTab) => void }) {
  const { data: list } = useSuspenseQuery(workloadAssessmentsQuery);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lg = useModalSize('lg');
  const xl = useModalSize('xl');
  const counts = workloadCounts(list);
  const target = dialog && 'id' in dialog ? list.find(a => a.id === dialog.id) ?? null : null;
  const close = () => setDialog(null);
  const open = (kind: 'cbi' | 'overload' | 'risk' | 'interview') => (a: Assessment) => setDialog({ kind, id: a.id });
  const saved = (a: Assessment, what: string) => {
    const ev = readEvaluation(a);
    const level = riskLevelOf(a);
    setNotice(`已儲存 ${a.name} 的${what}${level != null && ev?.advice ? `：${['低度', '中度', '高度'][level]}風險，${ev.advice}` : ''}。`);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>異常工作負荷促發疾病預防</Title>
          <Text c="dimmed" size="sm" mt={4}>以最近一次健檢的十年心血管風險，結合過勞量表、加班時數與工作型態，判定風險等級並安排醫師面談。</Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setDialog({ kind: 'dispatch' })}>發送問卷</Button>
      </Group>

      {notice && <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} closeButtonLabel="關閉">{notice}</Alert>}

      <Card>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <StatCard tone="blue" label="問卷未完成" value={counts.incomplete} note={`共 ${counts.total} 人評估`} />
          <StatCard tone="pink" label="高度風險" value={counts.high} note="需面談" />
          <StatCard tone="lavender" label="中度風險" value={counts.mid} note="建議面談" />
          <StatCard tone="mint" label="待面談" value={counts.toInterview} note="中、高度風險尚未面談" />
        </SimpleGrid>
      </Card>

      <Tabs value={tab} onChange={v => onTab((v ?? 'assess') as WorkloadTab)}>
        <Tabs.List>
          <Tabs.Tab value="assess">辨識及評估</Tabs.Tab>
          <Tabs.Tab value="interview">醫師面談</Tabs.Tab>
          <Tabs.Tab value="log">執行紀錄</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {tab === 'interview'
        ? <InterviewList list={list} picked={picked} onPick={setPicked} onOpen={open('interview')} onRisk={open('risk')} onSchedule={() => setDialog({ kind: 'schedule' })} />
        : tab === 'log' ? <LogTab list={list} />
          : <AssessList list={list} onCbi={open('cbi')} onOverload={open('overload')} onRisk={open('risk')} onNotice={setNotice} />}

      <Modal opened={dialog?.kind === 'cbi' && !!target} onClose={close} title={target ? `過勞量表 · ${target.name}` : ''} {...lg} scrollAreaComponent={ScrollArea.Autosize}>
        {target && <CbiForm key={target.id} a={target} onCancel={close} onSaved={a => { close(); saved(a, '過勞量表'); }} />}
      </Modal>
      <Modal opened={dialog?.kind === 'overload' && !!target} onClose={close} title={target ? `過負荷評估 · ${target.name}` : ''} {...lg}>
        {target && <OverloadForm key={target.id} a={target} onCancel={close} onSaved={a => { close(); saved(a, '過負荷評估'); }} />}
      </Modal>
      <Modal opened={dialog?.kind === 'risk' && !!target} onClose={close} title={target ? `個人風險評估 · ${target.name}` : ''} {...xl} scrollAreaComponent={ScrollArea.Autosize}>
        {target && <RiskDetail a={target} onClose={close} onInterview={() => setDialog({ kind: 'interview', id: target.id })} />}
      </Modal>
      <Modal opened={dialog?.kind === 'interview' && !!target} onClose={close} title={target ? `面談結果及處理措施 · ${target.name}` : ''} {...xl} scrollAreaComponent={ScrollArea.Autosize}>
        {target && <InterviewEditor key={target.id} a={target} onCancel={close} onSaved={a => { close(); setNotice(`已儲存 ${a.name} 的面談：${a.interview?.status ?? ''}。`); }} />}
      </Modal>
      <Modal opened={dialog?.kind === 'dispatch'} onClose={close} title="發送問卷：過勞量表與工時調查" {...xl} scrollAreaComponent={ScrollArea.Autosize}>
        {dialog?.kind === 'dispatch' && <DispatchForm list={list} onCancel={close} onCreated={n => { close(); onTab('assess'); setNotice(`已發送 ${n} 份過勞量表與工時調查，員工會在員工端看到待填問卷。`); }} />}
      </Modal>
      <Modal opened={dialog?.kind === 'schedule'} onClose={close} title="安排面談">
        {dialog?.kind === 'schedule' && (
          <ScheduleForm rows={list.filter(a => picked.has(a.id) && canSchedule(a))} onCancel={close}
            onDone={(n, failed) => { close(); setPicked(new Set(failed)); setNotice(failed.length ? `已安排 ${n} 人，${failed.length} 人沒有儲存成功，請再試一次。` : `已安排 ${n} 人的面談。`); }} />
        )}
      </Modal>
    </Stack>
  );
}

function AssessList({ list, onCbi, onOverload, onRisk, onNotice }: {
  list: Assessment[]; onCbi: (a: Assessment) => void; onOverload: (a: Assessment) => void; onRisk: (a: Assessment) => void; onNotice: (text: string) => void;
}) {
  const batches = [...new Set(list.map(a => a.sentOn))].sort().reverse();
  const [batch, setBatch] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [q, setQ] = useState('');
  const [reminding, setReminding] = useState(false);
  const remind = useRemindAssessments();
  const rows = filterAssessments(list, { batch, risk, q, org });
  const open = rows.filter(remindable);

  return (
    <Card>
      <Group gap="sm" mb="sm" justify="space-between">
        <Group gap="sm">
          <Select aria-label="評估日期" placeholder="全部日期" clearable w={150} size="xs" value={batch} onChange={setBatch} data={batches.map(b => ({ value: b, label: dt(b) }))} />
          <OrgFilterSelects rows={list} value={org} onChange={setOrg} />
          <SegmentedControl size="xs" value={risk} onChange={v => setRisk(v as RiskFilter)} data={RISK_FILTERS} aria-label="風險等級" />
        </Group>
        <Group gap="sm">
          <TextInput size="xs" aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={14} />} w={160} value={q} onChange={e => setQ(e.currentTarget.value)} />
          <Button size="xs" variant="default" leftSection={<IconMailForward size={14} />} disabled={!open.length} onClick={() => setReminding(true)}>
            未填寫通知{open.length ? `（${open.length}）` : ''}
          </Button>
          <ExportButton count={rows.length} onExport={() => downloadCsv(`過勞評估_${todayIso()}.csv`, ASSESS_COLUMNS, rows)} />
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={1060}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>評估日期</Table.Th><Table.Th>員工</Table.Th><Table.Th>過負荷評估</Table.Th><Table.Th>過勞量表</Table.Th><Table.Th ta="right">十年心血管風險</Table.Th>
              <Table.Th>工作負荷</Table.Th><Table.Th>風險等級</Table.Th><Table.Th>面談建議</Table.Th><Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(a => {
              const ev = readEvaluation(a);
              return (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    {dt(a.sentOn)}
                    {a.reminders > 0 && <Text size="xs" c="dimmed" title={a.lastRemindedAt ? `最近一次 ${when(a.lastRemindedAt)}` : undefined}>已催填 {a.reminders} 次</Text>}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}><Person a={a} /></Table.Td>
                  <Table.Td>
                    {a.missing.includes('overload') || a.overtime1m == null ? <Pending onFill={() => onOverload(a)} label={`代填 ${a.name} 的過負荷評估`} /> : (
                      <Anchor component="button" type="button" size="sm" onClick={() => onOverload(a)} aria-label={`修改 ${a.name} 的過負荷評估`}>近 1 月 {a.overtime1m} 小時</Anchor>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {a.missing.includes('cbi') || a.personalBurnout == null ? <Pending onFill={() => onCbi(a)} label={`代填 ${a.name} 的過勞量表`} /> : (
                      <>
                        <Anchor component="button" type="button" size="sm" onClick={() => onCbi(a)} aria-label={`修改 ${a.name} 的過勞量表`}>個人 {a.personalBurnout}／工作 {a.workBurnout ?? '—'}</Anchor>
                        {a.fatigueBy === 'nurse' && <Text size="xs" c="dimmed">職護代填</Text>}
                      </>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{ev?.cvd ? `${ev.cvd.risk}%` : <Text span size="sm" c="dimmed">{ev ? '缺健檢資料' : '—'}</Text>}</Table.Td>
                  <Table.Td><LoadBadge level={ev?.load?.level} /></Table.Td>
                  <Table.Td><RiskBadge level={riskLevelOf(a)} empty={noRiskReason(a)} /></Table.Td>
                  <Table.Td>{ev?.complete ? ev.advice : '—'}{a.interview && <Text size="xs" c="dimmed">{IV_SHORT[a.interview.status]}</Text>}</Table.Td>
                  <Table.Td ta="right"><Button size="xs" variant="default" onClick={() => onRisk(a)}>檢視</Button></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {rows.length === 0 && <CardNote>{list.length === 0 ? '還沒有發送過過勞量表。按「發送問卷」選擇要評估的員工。' : '沒有符合條件的評估。'}</CardNote>}
      <RemindModal opened={reminding} rows={open} what="過勞量表或工時調查" send={remind} onClose={() => setReminding(false)}
        onDone={text => { setReminding(false); onNotice(text); }} />
    </Card>
  );
}

function Person({ a }: { a: Pick<Assessment, 'employeeId' | 'name' | 'empNo'> }) {
  return (
    <>
      <AnchorLink to="/employees/$employeeId" params={{ employeeId: a.employeeId }} fw={600}>{a.name}</AnchorLink>
      <Text size="xs" c="dimmed" ff="monospace">{a.empNo}</Text>
    </>
  );
}

function Pending({ onFill, label }: { onFill: () => void; label: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Badge styles={tone('warn')}>未填寫</Badge>
      <Anchor component="button" type="button" size="sm" fw={600} onClick={onFill} aria-label={label}>代填</Anchor>
    </Group>
  );
}

function InterviewList({ list, picked, onPick, onOpen, onRisk, onSchedule }: {
  list: Assessment[]; picked: Set<string>; onPick: (s: Set<string>) => void; onOpen: (a: Assessment) => void; onRisk: (a: Assessment) => void; onSchedule: () => void;
}) {
  const [filter, setFilter] = useState<InterviewFilter>('open');
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [q, setQ] = useState('');
  const rows = interviewRows(list, filter, q, org);
  const schedulable = rows.filter(canSchedule);
  const chosen = list.filter(a => picked.has(a.id) && canSchedule(a)).length;
  const all = schedulable.length > 0 && schedulable.every(a => picked.has(a.id));
  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(picked);
    for (const id of ids) if (on) next.add(id); else next.delete(id);
    onPick(next);
  };

  return (
    <Card>
      <Group gap="sm" mb="sm" justify="space-between">
        <Group gap="sm">
          <SegmentedControl size="xs" value={filter} onChange={v => setFilter(v as InterviewFilter)} aria-label="面談狀態"
            data={[{ value: 'open', label: '未完成' }, { value: 'done', label: '已完成' }, { value: 'all', label: '全部' }]} />
          <OrgFilterSelects rows={list} value={org} onChange={setOrg} />
          <Text size="sm">已選 <b>{chosen}</b> 人</Text>
          <Button size="xs" disabled={!chosen} onClick={onSchedule}>安排面談</Button>
        </Group>
        <TextInput size="xs" aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={14} />} w={180} value={q} onChange={e => setQ(e.currentTarget.value)} />
      </Group>
      <Table.ScrollContainer minWidth={1080}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36}><Checkbox aria-label="選取所有可安排的人" checked={all} indeterminate={!all && schedulable.some(a => picked.has(a.id))} disabled={!schedulable.length} onChange={e => toggle(schedulable.map(a => a.id), e.currentTarget.checked)} /></Table.Th>
              <Table.Th>評估日期</Table.Th><Table.Th>員工</Table.Th><Table.Th>風險等級</Table.Th><Table.Th>面談狀態</Table.Th><Table.Th>面談日期／醫師</Table.Th>
              <Table.Th>工作安排</Table.Th><Table.Th>員工確認／通知</Table.Th><Table.Th>下次面談</Table.Th><Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(a => {
              const iv = a.interview;
              const w = adviceSummary(iv?.workAdvice ?? null);
              return (
                <Table.Tr key={a.id}>
                  <Table.Td><Checkbox aria-label={`選取 ${a.name}`} checked={picked.has(a.id)} disabled={!canSchedule(a)} onChange={e => toggle([a.id], e.currentTarget.checked)} /></Table.Td>
                  <Table.Td>{dt(a.sentOn)}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}><Person a={a} /></Table.Td>
                  <Table.Td><Button variant="transparent" p={0} h="auto" onClick={() => onRisk(a)} aria-label={`檢視 ${a.name} 的風險評估`}><RiskBadge level={riskLevelOf(a)} empty={noRiskReason(a)} /></Button></Table.Td>
                  <Table.Td>{iv ? <Badge styles={tone(IV_TONE[iv.status])}>{iv.status}</Badge> : <Badge styles={tone('warn')}>未安排</Badge>}</Table.Td>
                  <Table.Td>{iv?.interviewedOn ? dt(iv.interviewedOn) : '—'}{iv?.doctorName && <Text size="xs" c="dimmed">{iv.doctorName}</Text>}</Table.Td>
                  <Table.Td maw={240}>
                    {w ? <><Text size="sm">{w.fitness || '—'}</Text>{w.measures && <Text size="xs" c="dimmed">{w.measures}</Text>}</> : '—'}
                  </Table.Td>
                  <Table.Td><FollowUpCell iv={iv} /></Table.Td>
                  <Table.Td>{iv?.nextOn ? dt(iv.nextOn) : '—'}</Table.Td>
                  <Table.Td ta="right"><Button size="xs" variant={interviewDone(iv) ? 'default' : 'filled'} onClick={() => onOpen(a)}>{iv?.status === '已面談' ? '編輯' : '填寫'}</Button></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {rows.length === 0 && <CardNote>{filter === 'open' ? '目前沒有需要面談的員工。' : '沒有符合條件的面談。'}</CardNote>}
      <Text size="xs" c="dimmed" mt="xs">中度、高度風險與已有面談紀錄的員工會列在這裡。只有還沒有面談紀錄的人可以勾選批次安排。</Text>
    </Card>
  );
}

/** Whether the employee confirmed the outcome, and how many managers were told and have read it. */
function FollowUpCell({ iv }: { iv: Interview | null }) {
  if (!iv || (!iv.acknowledgement && !iv.notices.length)) return <>—</>;
  const state = iv.acknowledgement && ackState(iv.acknowledgement);
  const read = iv.notices.filter(n => n.readAt).length;
  return (
    <Stack gap={2} align="flex-start">
      {state && <ToneBadge tone={ACK_TONE[state]}>{ACK_LABEL[state]}</ToneBadge>}
      {iv.notices.length > 0 && <Text size="xs" c="dimmed">已通知主管 {iv.notices.length} 次，已讀 {read}</Text>}
    </Stack>
  );
}

function LogTab({ list }: { list: Assessment[] }) {
  const rows = batchLog(list);
  const c = workloadCounts(list);
  const done = c.high + c.mid + c.low;
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  return (
    <Card>
      <Text fw={600} mb="xs">風險等級分布</Text>
      <Text size="xs" c="dimmed" mb="sm">已完成評估 {done} 人</Text>
      <Progress.Root size={18} mb="xs" aria-label="風險等級分布">
        {([['低度', c.low, 'ok'], ['中度', c.mid, 'warn'], ['高度', c.high, 'bad']] as const).map(([label, n, t]) => n > 0 && (
          <Progress.Section key={label} value={(n / done) * 100} color={`var(--yutis-${t})`} aria-label={`${label}風險 ${n} 人`}><Progress.Label>{n}</Progress.Label></Progress.Section>
        ))}
      </Progress.Root>
      <Group gap="md" mb="md">
        {([['低度風險', c.low, 'ok'], ['中度風險', c.mid, 'warn'], ['高度風險', c.high, 'bad']] as const).map(([label, n, t]) => (
          <Group key={label} gap={6}><Box w={10} h={10} style={{ borderRadius: '50%', background: `var(--yutis-${t})` }} /><Text size="xs">{label} {n}</Text></Group>
        ))}
      </Group>
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>評估日期</Table.Th><Table.Th ta="right">發送人數</Table.Th><Table.Th ta="right">完成評估</Table.Th><Table.Th ta="right">高度風險</Table.Th>
              <Table.Th ta="right">中度風險</Table.Th><Table.Th ta="right">低度風險</Table.Th><Table.Th ta="right">已完成面談</Table.Th><Table.Th ta="right">採取措施</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(r => (
              <Table.Tr key={r.sentOn}>
                <Table.Td>{dt(r.sentOn)}</Table.Td><Table.Td ta="right">{r.sent}</Table.Td><Table.Td ta="right">{r.done}（{pct(r.done, r.sent)}%）</Table.Td>
                <Table.Td ta="right">{r.high}</Table.Td><Table.Td ta="right">{r.mid}</Table.Td><Table.Td ta="right">{r.low}</Table.Td>
                <Table.Td ta="right">{r.interviewed}</Table.Td><Table.Td ta="right">{r.measures}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {rows.length === 0 && <CardNote>還沒有評估紀錄。</CardNote>}
      <Text size="xs" c="dimmed" mt="xs">採取措施：面談後建議工作限制、需休假，或列出工作調整項目的人數。</Text>
    </Card>
  );
}

function RiskDetail({ a, onClose, onInterview }: { a: Assessment; onClose: () => void; onInterview: () => void }) {
  const ev = readEvaluation(a);
  const missing = missingSteps(a);
  const level = riskLevelOf(a);
  return (
    <Stack gap="md">
      <Group gap="lg" c="dimmed" fz="sm">
        <span>{a.empNo}</span><span>評估日期 {dt(a.sentOn)}</span>
        {a.workPatterns.length > 0 && <span>工作型態：{a.workPatterns.join('、')}</span>}
      </Group>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Box p="md" h="100%" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Text fw={600} mb="xs">個人風險因子{ev?.cvd?.reportDate ? `（${dt(ev.cvd.reportDate)} 健檢）` : ''}</Text>
            {ev?.cvd ? (
              <>
                <Table verticalSpacing={4}>
                  <Table.Thead><Table.Tr><Table.Th>項目</Table.Th><Table.Th>值</Table.Th><Table.Th ta="right">分數</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{ev.cvd.items.map(i => <Table.Tr key={i.name}><Table.Td>{i.name}</Table.Td><Table.Td>{i.value}</Table.Td><Table.Td ta="right">{i.pts}</Table.Td></Table.Tr>)}</Table.Tbody>
                </Table>
                <Text size="sm" mt="xs">總分 <b>{ev.cvd.total}</b> 分 · 十年內缺血性心臟病機率 <b>{ev.cvd.risk}%</b></Text>
              </>
            ) : <Text size="sm" c="dimmed">沒有可用的健檢資料（需要血脂、血壓等項目），無法計算心血管風險。</Text>}
          </Box>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Box p="md" h="100%" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Text fw={600} mb="xs">過負荷量表與工時</Text>
            {ev?.load ? (
              <>
                <Table verticalSpacing={4}>
                  <Table.Thead><Table.Tr><Table.Th>項目</Table.Th><Table.Th>值</Table.Th><Table.Th w={76}>負荷</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{ev.load.items.map(i => <Table.Tr key={i.name}><Table.Td>{i.name}</Table.Td><Table.Td>{i.value}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}><LoadBadge level={i.lv} /></Table.Td></Table.Tr>)}</Table.Tbody>
                </Table>
                <Group gap="xs" mt="xs"><Text size="sm">工作負荷等級（取最高者）</Text><LoadBadge level={ev.load.level} /></Group>
              </>
            ) : <Text size="sm" c="dimmed">{missing.length ? `${missing.join('、')}尚未填寫。` : '尚未評估。'}</Text>}
          </Box>
        </Grid.Col>
      </Grid>
      {ev?.complete && ev.cvd && ev.load && level != null ? (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text fw={600} mb="xs">風險矩陣（十年風險 × 工作負荷）</Text>
            <WorkloadMatrix band={ev.cvd.band} load={ev.load.level} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="xs">
              <Group gap="xs"><Text size="sm" c="dimmed" w={120}>風險等級</Text><RiskBadge level={level} /></Group>
              <Group gap="xs"><Text size="sm" c="dimmed" w={120}>安排醫師面談</Text><Text size="sm" fw={600}>{ev.advice}</Text></Group>
              {ev.shortM && ev.shortM !== '—' && <Group gap="xs"><Text size="sm" c="dimmed" w={120}>措施建議</Text><Text size="sm">{ev.shortM}</Text></Group>}
              <Text size="sm" c="dimmed">健康管理措施</Text>
              <Text size="sm">{ev.longM}</Text>
            </Stack>
          </Grid.Col>
        </Grid>
      ) : (
        <Alert color="yellow" variant="light">無法判定風險等級：{[...missing, ...(ev && !ev.cvd ? ['健檢資料不足'] : [])].join('、') || '尚未評估'}。</Alert>
      )}
      <Text size="xs" c="dimmed">十年心血管風險以簡化的 Framingham 點數法，依評估當下最近一次健檢計算；儲存問卷時會重新評估。</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>返回</Button>
        {/* Elevated risk calls for an interview; anyone else may still ask for one. */}
        <Button variant={(level ?? 0) >= 1 && !interviewDone(a.interview) ? 'filled' : 'default'} onClick={onInterview}>
          {a.interview ? '面談紀錄' : (level ?? 0) >= 1 ? '填寫面談結果' : '記錄面談'}
        </Button>
      </Group>
    </Stack>
  );
}

function CbiForm({ a, onCancel, onSaved }: { a: Assessment; onCancel: () => void; onSaved: (a: Assessment) => void }) {
  /* Scores typed in without answers open on the scores; otherwise the saved answers are the starting point. */
  const [mode, setMode] = useState<'answers' | 'scores'>(a.personalBurnout != null && !a.cbiAnswers ? 'scores' : 'answers');
  const [draft, setDraft] = useState<CbiDraft>(() => cbiDraftFrom(a.cbiAnswers));
  const [pf, setPf] = useState<number | string>(a.personalBurnout ?? '');
  const [wf, setWf] = useState<number | string>(a.workBurnout ?? '');
  const save = useSaveStep();
  const result = cbiResult(draft);
  const scoresOk = typeof pf === 'number' && typeof wf === 'number';
  const set = (part: 'p' | 'w', i: number, v: string | null) => setDraft(d => ({ ...d, [part]: d[part].map((x, j) => (j === i ? (v == null ? null : Number(v)) : x)) }));
  const submit = () => {
    const body = mode === 'answers' ? (result ? { cbi: { p: draft.p as number[], w: draft.w as number[] } } : null) : scoresOk ? { personalBurnout: pf, workBurnout: wf } : null;
    if (body) save.mutate({ step: 'fatigue', id: a.id, body }, { onSuccess: onSaved });
  };
  const question = (part: 'p' | 'w', i: number, text: string, scale: readonly string[]) => (
    <Box key={`${part}${i}`} py={8} style={{ borderTop: '1px solid var(--yutis-line)' }}>
      <Text size="sm" mb={6}>{i + 1}. {text}</Text>
      <Chip.Group value={draft[part][i] == null ? null : String(draft[part][i])} onChange={v => set(part, i, v)}>
        <Group gap={4} role="radiogroup" aria-label={text}>{scale.map((s, n) => <Chip key={s} value={String(n)} size="xs">{s}</Chip>)}</Group>
      </Chip.Group>
    </Box>
  );

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {a.personalBurnout == null ? '依員工口述勾選，或輸入已計算好的分數（例如紙本量表的結果）。'
          : `目前分數：個人相關 ${a.personalBurnout}、工作相關 ${a.workBurnout ?? '—'}${a.fatigueAt ? `（${when(a.fatigueAt)} ${a.fatigueBy === 'nurse' ? '職護代填' : '員工自填'}）` : ''}。`
            + (a.cbiAnswers ? '已帶入原本的作答；修改後儲存會重新評估。' : '原本是直接輸入分數，沒有逐題作答；儲存會取代並重新評估。')}
      </Text>
      <SegmentedControl value={mode} onChange={v => setMode(v as typeof mode)} data={[{ value: 'answers', label: '作答量表' }, { value: 'scores', label: '輸入分數' }]} aria-label="填寫方式" />
      {mode === 'answers' ? (
        <>
          <div>
            <Text fw={600}>一、個人相關過勞</Text>
            {CBI_PERSONAL.map((q, i) => question('p', i, q, CBI_FREQ))}
          </div>
          <div>
            <Text fw={600}>二、工作相關過勞</Text>
            {CBI_WORK.map((q, i) => question('w', i, q.q, q.scale))}
          </div>
          <Box p="sm" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Text size="sm">{result
              ? `個人相關過勞 ${result.pf} 分（${burnoutLabel('personal', result.pf)}） · 工作相關過勞 ${result.wf} 分（${burnoutLabel('work', result.wf)}）`
              : `已作答 ${cbiAnswered(draft)}／13 題`}</Text>
          </Box>
        </>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput label="個人相關過勞分數" min={0} max={100} decimalScale={1} value={pf} onChange={setPf} required />
          <NumberInput label="工作相關過勞分數" min={0} max={100} decimalScale={1} value={wf} onChange={setWf} required />
        </SimpleGrid>
      )}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{problemText(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button disabled={mode === 'answers' ? !result : !scoresOk} loading={save.isPending} onClick={submit}>儲存</Button>
      </Group>
    </Stack>
  );
}

function OverloadForm({ a, onCancel, onSaved }: { a: Assessment; onCancel: () => void; onSaved: (a: Assessment) => void }) {
  const [m1, setM1] = useState<number | string>(a.overtime1m ?? '');
  const [avg6, setAvg6] = useState<number | string>(a.overtime6mAvg ?? '');
  const [patterns, setPatterns] = useState<string[]>(a.workPatterns);
  const save = useSaveStep();
  const ok = typeof m1 === 'number' && typeof avg6 === 'number';
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <NumberInput label="近 1 個月加班時數" min={0} max={744} decimalScale={1} value={m1} onChange={setM1} required />
        <NumberInput label="近 2–6 個月平均加班時數" min={0} max={744} decimalScale={1} value={avg6} onChange={setAvg6} required />
      </SimpleGrid>
      <Checkbox.Group label="工作型態（可複選）" value={patterns} onChange={setPatterns}>
        <Stack gap={8} mt={8}>{WORK_PATTERNS.map(p => <Checkbox key={p} value={p} label={p} />)}</Stack>
      </Checkbox.Group>
      <Text size="xs" c="dimmed">加班：近 1 個月超過 100 小時或 2–6 個月平均超過 80 小時為高負荷；任一達 45 小時為中負荷。工作型態 2–3 項為中負荷，4 項以上為高負荷。</Text>
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{problemText(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button disabled={!ok} loading={save.isPending}
          onClick={() => ok && save.mutate({ step: 'overload', id: a.id, body: { overtime1m: m1, overtime6mAvg: avg6, workPatterns: patterns as (typeof WORK_PATTERNS)[number][] } }, { onSuccess: onSaved })}>儲存</Button>
      </Group>
    </Stack>
  );
}

/** Active 職醫 accounts (GET /api/staff), plus whoever is on the interview if their account was since closed. */
function useDoctorOptions(current?: { id: string | null; name: string | null }) {
  const me = useMe();
  const doctors = useQuery(doctorsQuery);
  const list = doctors.data ?? [];
  const options = list.map(d => ({ value: d.id, label: d.id === me.id ? `${d.name}（我）` : d.name }));
  if (current?.id && !list.some(d => d.id === current.id)) options.push({ value: current.id, label: current.name ?? '已指定的醫師' });
  const mine = me.role === '職醫' ? me.id : null;
  return { options, mine, placeholder: doctors.isPending ? '載入中…' : doctors.isError ? problemText(doctors.error) : list.length ? '選擇醫師' : '沒有啟用中的職醫帳號' };
}

/**
 * The interview form starts from the full record (GET /assessments/{id}): the guidance and notes are medical and the
 * list leaves them out. A new interview has nothing to load.
 */
function InterviewEditor({ a, onCancel, onSaved }: { a: Assessment; onCancel: () => void; onSaved: (a: Assessment) => void }) {
  const detail = useQuery({ ...assessmentDetailQuery(a.id), enabled: !!a.interview });
  if (!a.interview) return <InterviewForm a={a} saved={null} onCancel={onCancel} onSaved={onSaved} />;
  if (detail.isPending) return <Stack gap="sm"><Skeleton h={36} /><Skeleton h={220} /><Skeleton h={120} /></Stack>;
  if (detail.isError) {
    return (
      <Stack gap="sm">
        <CardNote>{problemText(detail.error)}</CardNote>
        <Group justify="flex-end"><Button variant="default" onClick={onCancel}>關閉</Button><Button onClick={() => void detail.refetch()}>再試一次</Button></Group>
      </Stack>
    );
  }
  return <InterviewForm a={a} saved={detail.data.interview} onCancel={onCancel} onSaved={onSaved} />;
}

function InterviewForm({ a, saved, onCancel, onSaved }: { a: Assessment; saved: Interview | null; onCancel: () => void; onSaved: (a: Assessment) => void }) {
  const qc = useQueryClient();
  const doctors = useDoctorOptions({ id: saved?.doctorUserId ?? null, name: saved?.doctorName ?? null });
  const [d, setD] = useState<InterviewDraft>(() => interviewDraft(saved, { today: todayIso(), doctorUserId: doctors.mine }));
  const save = useSaveStep();
  const problems = interviewProblems(d);
  const ev = readEvaluation(a);
  const held = d.status === '已面談';
  const set = <K extends keyof InterviewDraft>(k: K, v: InterviewDraft[K]) => setD(x => ({ ...x, [k]: v }));
  /* The list row, not the form's copy: it is what the follow-up below patches as links and notices go out. */
  const iv = a.interview;

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">{a.empNo} · {a.department} · 評估日期 {dt(a.sentOn)} · {ev?.complete && ev.advice ? `${['低度', '中度', '高度'][riskLevelOf(a) ?? 0]}風險，${ev.advice}` : '風險等級未判定'}</Text>
      <SegmentedControl value={d.status} onChange={v => set('status', v as InterviewStatus)} data={INTERVIEW_STATUSES} aria-label="面談狀態" />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <TextInput type="date" label={held || d.status === '拒絕面談' ? '面談指導日期' : '預定面談日期'} value={d.interviewedOn}
          onChange={e => set('interviewedOn', e.currentTarget.value)} required={d.status === '已安排' || held} />
        <Select label="面談醫師" clearable allowDeselect={false} searchable data={doctors.options} value={d.doctorUserId} onChange={v => set('doctorUserId', v)}
          placeholder={doctors.placeholder} nothingFoundMessage="找不到這位醫師" />
      </SimpleGrid>

      <Section title="面談指導結果" note="醫療資料，加密儲存，只有職護、職醫看得到。">
        <Choice label="疲勞累積狀況" required={held} options={FATIGUE} value={d.fatigue} onChange={v => set('fatigue', v)} />
        <Choice label="應顧慮身心狀況" options={MENTAL_CONCERN} value={d.mentalConcern} onChange={v => set('mentalConcern', v)} />
        <Choice label="診斷區分" required={held} options={DIAGNOSIS} value={d.diagnosis} onChange={v => set('diagnosis', v)} />
        <Choice label="指導區分" options={GUIDANCE} value={d.guidance} onChange={v => set('guidance', v)} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Choice label="是否需採取措施" options={['是', '否'] as const} value={d.needMeasure == null ? null : d.needMeasure ? '是' : '否'}
            onChange={v => set('needMeasure', v == null ? null : v === '是')} />
          <TextInput label="建議就醫" placeholder="例如 心臟內科" maxLength={100} value={d.seeDoctor} onChange={e => set('seeDoctor', e.currentTarget.value)} />
        </SimpleGrid>
        <Textarea label="特殊記載事項" autosize minRows={2} maxLength={2000} value={d.special} onChange={e => set('special', e.currentTarget.value)} />
        <Textarea label="面談紀錄" autosize minRows={3} maxLength={10000} value={d.notes} onChange={e => set('notes', e.currentTarget.value)}
          placeholder="健康諮詢內容與處理狀況" />
      </Section>

      <Section title="工作安排與採取措施建議" note="人資與通知的部門主管會看到這段（不含面談指導結果與紀錄），員工也會確認這段內容。">
        <Choice label="工作區分" required={held} options={FITNESS} value={(FITNESS as readonly string[]).includes(d.fitness) ? d.fitness as (typeof FITNESS)[number] : null}
          onChange={v => set('fitness', v ?? '')} />
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Select label="調整或縮短工作時間" clearable data={withCurrent(ADJUST_HOURS, d.adjustHours)} value={d.adjustHours || null} onChange={v => set('adjustHours', v ?? '')} placeholder="不需要" />
          <Select label="變更工作" clearable data={withCurrent(CHANGE_WORK, d.changeWork)} value={d.changeWork || null} onChange={v => set('changeWork', v ?? '')} placeholder="不需要" />
          <TextInput label="措施期間" placeholder="例如 3 個月" maxLength={50} value={d.period} onChange={e => set('period', e.currentTarget.value)} />
        </SimpleGrid>
        <TagsInput label="其他工作限制" value={d.restrictions} onChange={v => set('restrictions', v)} placeholder="輸入後按 Enter" maxTags={20} clearable />
        <Textarea label="備註" autosize minRows={2} maxLength={1000} value={d.suggestion} onChange={e => set('suggestion', e.currentTarget.value)} />
      </Section>

      <TextInput type="date" label="下次面談預定日期" value={d.nextOn} onChange={e => set('nextOn', e.currentTarget.value)} maw={240} />

      {iv && (
        <Section title="員工確認與通知主管" note="依已儲存的工作安排建議。修改後請先儲存，再通知主管。">
          <InterviewFollowUp employee={{ id: a.employeeId, name: a.name }} subjectTable="interviews" subjectId={iv.id} advice={workloadNoticeText(iv.workAdvice)}
            acknowledgement={iv.acknowledgement} notices={iv.notices}
            onAcknowledgementSent={sentAt => patchInterview(qc, a.id, x => ({ ...x, acknowledgement: x.acknowledgement && { ...x.acknowledgement, sentAt } }))}
            onNoticeSent={n => patchInterview(qc, a.id, x => ({ ...x, notices: [...x.notices, n] }))} />
        </Section>
      )}

      {save.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(save.error)}</Text>}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{problems[0] ?? ''}</Text>
        <Group gap="sm">
          <Button variant="default" onClick={onCancel}>取消</Button>
          <Button disabled={problems.length > 0} loading={save.isPending} onClick={() => save.mutate({ step: 'interview', id: a.id, body: interviewBody(d) }, { onSuccess: onSaved })}>儲存</Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** Keep a value saved earlier in the options even when it is not one of today's choices. */
const withCurrent = (options: readonly string[], current: string) => (current && !options.includes(current) ? [...options, current] : [...options]);

/** One answer from a short list, as chips; choosing the chosen one again clears it. */
function Choice<T extends string>({ label, options, value, onChange, required }: {
  label: string; options: readonly T[]; value: T | null; onChange: (v: T | null) => void; required?: boolean;
}) {
  return (
    <Input.Wrapper label={label} required={required} labelElement="div">
      <Group gap={6} mt={4} role="group" aria-label={label}>
        {options.map(o => <Chip key={o} size="xs" checked={value === o} onChange={() => onChange(value === o ? null : o)}>{o}</Chip>)}
      </Group>
    </Input.Wrapper>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Stack gap="xs" pt="xs" style={{ borderTop: '1px solid var(--yutis-line)' }}>
      <div><Text fw={600}>{title}</Text><Text size="xs" c="dimmed">{note}</Text></div>
      {children}
    </Stack>
  );
}

/** 面談通知, as far as the API goes: mark the interview 已安排 with a date. No email or reply tracking exists yet. */
function ScheduleForm({ rows, onCancel, onDone }: { rows: Assessment[]; onCancel: () => void; onDone: (saved: number, failed: string[]) => void }) {
  const doctors = useDoctorOptions();
  const [on, setOn] = useState(addDays(todayIso(), 7));
  const [doctor, setDoctor] = useState<string | null>(doctors.mine);
  const schedule = useScheduleInterviews();
  return (
    <Stack gap="md">
      <Text size="sm">安排對象：{rows.map(a => a.name).join('、')}（{rows.length} 人）</Text>
      <TextInput type="date" label="預定面談日期" required value={on} onChange={e => setOn(e.currentTarget.value)} />
      <Select label="面談醫師" clearable allowDeselect={false} searchable data={doctors.options} value={doctor} onChange={setDoctor} placeholder={doctors.placeholder} nothingFoundMessage="找不到這位醫師" />
      <Text size="xs" c="dimmed">面談狀態會改為「已安排」並記下預定日期與醫師。系統不會寄出面談通知信，請另行通知員工。</Text>
      {schedule.isError && <Text size="sm" c="var(--yutis-bad)">{problemText(schedule.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button disabled={!on || !rows.length} loading={schedule.isPending}
          onClick={() => schedule.mutate(
            { ids: rows.map(a => a.id), body: { status: '已安排', interviewedOn: on, doctorUserId: doctor } },
            { onSuccess: r => onDone(r.saved, r.failed) },
          )}>安排面談</Button>
      </Group>
    </Stack>
  );
}

function DispatchForm({ list, onCancel, onCreated }: { list: Assessment[]; onCancel: () => void; onCreated: (n: number) => void }) {
  const [sentOn, setSentOn] = useState(todayIso());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const create = useCreateAssessments();
  const blocked = new Map([...openAssessmentEmployees(list)].map(id => [id, '已有未完成的評估']));
  const problem = !sentOn ? '請填評估日期' : !picked.size ? '請勾選要評估的員工' : null;
  return (
    <Stack gap="md">
      <TextInput type="date" label="評估日期" required value={sentOn} onChange={e => setSentOn(e.currentTarget.value)} maw={240} />
      <EmployeePicker selected={picked} onChange={setPicked} blocked={blocked} />
      <Text size="xs" c="dimmed">員工會在員工端填寫過勞量表與加班時數，也可以由職護代填。十年心血管風險依員工最近一次健檢自動計算。</Text>
      {create.isError && <Text size="sm" c="var(--yutis-bad)">{problemText(create.error)}</Text>}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{problem ?? `將發送給 ${picked.size} 人`}</Text>
        <Group gap="sm">
          <Button variant="default" onClick={onCancel}>取消</Button>
          <Button disabled={!!problem} loading={create.isPending} onClick={() => create.mutate({ employeeIds: [...picked], sentOn }, { onSuccess: r => onCreated(r.length) })}>發送問卷</Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** 人資: the work-arrangement advice from overwork interviews, without any health detail (GET /api/programs/work-advice). */
export function WorkloadAdvicePage() {
  const advice = useQuery(workAdviceQuery);
  const rows = (advice.data ?? []).filter(a => a.programme === '異常工作負荷').sort((a, b) => (b.on ?? '').localeCompare(a.on ?? ''));
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>異常工作負荷</Title>
        <Text c="dimmed" size="sm" mt={4}>醫師面談後的工作安排建議，請依建議調整工作。健康數值與面談內容只有職護、職醫看得到。</Text>
      </div>
      <Card>
        <Text fw={600} mb="sm">工作安排建議</Text>
        {advice.isPending ? <Skeleton h={160} /> : advice.isError ? <CardNote>{problemText(advice.error)}</CardNote> : (
          <>
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>員工</Table.Th><Table.Th>面談日期</Table.Th><Table.Th>工作安排建議</Table.Th><Table.Th>工作調整</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {rows.map((a, i) => (
                    <Table.Tr key={`${a.employeeId}-${i}`}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}><Person a={a} /></Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{a.on ? dt(a.on) : '—'}</Table.Td>
                      <Table.Td>{a.advice || '—'}</Table.Td>
                      <Table.Td>{a.restrictions.length ? a.restrictions.join('、') : '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {rows.length === 0 && <CardNote>目前沒有異常工作負荷的工作安排建議。</CardNote>}
          </>
        )}
      </Card>
    </Stack>
  );
}
