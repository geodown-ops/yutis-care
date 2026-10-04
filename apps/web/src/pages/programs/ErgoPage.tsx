import { Alert, Badge, Box, Button, Card, Chip, Grid, Group, Modal, Progress, ScrollArea, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { StatCard } from '@yutis/ui';
import { useState, type ReactNode } from 'react';
import { todayIso } from '../../cases';
import { AnchorLink, ButtonLink, splat } from '../../links';
import { canAccess } from '../../nav';
import { ergoDispatchesQuery } from '../../queries';
import { useMe } from '../../session';
import { CardNote, problemText } from '../states';
import {
  addDays, defaultDispatchName, dispatchTotals, draftMax, emptyNmq, filterSurveys, hazardLabel, isSuspected, nmqBody, nmqUnanswered,
  NMQ_ROWS, NMQ_SCALE, NMQ_YES_NO, SURVEY_FILTERS, type Dispatch, type NmqDraft, type Survey, type SurveyFilter,
} from './ergo';
import { useCreateDispatch, useFillNmq, ergoSurveysQuery } from './ergoQueries';
import { EmployeePicker } from './ergoWorkloadPicker';

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
  const [filter, setFilter] = useState<SurveyFilter>('all');
  const [q, setQ] = useState('');
  const [filling, setFilling] = useState<Survey | null>(null);
  const rows = surveys.data ? filterSurveys(surveys.data, filter, q) : [];

  return (
    <Card>
      <Group justify="space-between" mb="sm" align="flex-start">
        <div>
          <Text fw={600}>{dispatch.name}</Text>
          <Text size="xs" c="dimmed">{dt(dispatch.sentOn)} 發送{dispatch.dueOn ? ` · ${dt(dispatch.dueOn)} 截止` : ''} · 已填寫 {dispatch.filled}/{dispatch.total}</Text>
        </div>
      </Group>
      <Group gap="sm" mb="sm" justify="space-between">
        <SegmentedControl size="xs" value={filter} onChange={v => setFilter(v as SurveyFilter)} data={SURVEY_FILTERS} aria-label="填答狀況" />
        <TextInput size="xs" aria-label="以姓名或工號搜尋" placeholder="姓名或工號" leftSection={<IconSearch size={14} />} w={180} value={q} onChange={e => setQ(e.currentTarget.value)} />
      </Group>
      {surveys.isPending ? <Skeleton h={240} /> : surveys.isError ? <CardNote>{problemText(surveys.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>員工</Table.Th><Table.Th>工號</Table.Th><Table.Th>填寫狀況</Table.Th><Table.Th>危害判定</Table.Th><Table.Th ta="right">最高分</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(s => (
                  <Table.Tr key={s.id}>
                    <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: s.employeeId }} fw={600}>{s.name}</AnchorLink></Table.Td>
                    <Table.Td ff="monospace" fz="sm">{s.empNo}</Table.Td>
                    <Table.Td>
                      {s.status === '已填寫' ? (
                        <><Text size="sm">已填寫</Text><Text size="xs" c="dimmed">{s.filledAt ? dt(s.filledAt) : ''} · {s.filledBy === 'nurse' ? '職護代填' : '本人填寫'}</Text></>
                      ) : <Badge styles={tone('warn')}>未填寫</Badge>}
                    </Table.Td>
                    <Table.Td>{s.status === '已填寫' ? <Badge styles={tone(isSuspected(s.maxScore) ? 'bad' : 'ok')}>{hazardLabel(s.maxScore)}</Badge> : <Text c="dimmed">—</Text>}</Table.Td>
                    <Table.Td ta="right">{s.maxScore ?? '—'}</Table.Td>
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
    </Card>
  );
}

/** 職護代填 (and re-entry). The API does not return earlier answers, so the form always starts empty. */
function NmqModal({ survey, dispatchId, onClose, onSaved }: { survey: Survey | null; dispatchId: string; onClose: () => void; onSaved: (s: Survey) => void }) {
  return (
    <Modal opened={!!survey} onClose={onClose} title={survey ? `肌肉骨骼症狀調查 · ${survey.name}` : ''} size="lg" scrollAreaComponent={ScrollArea.Autosize}>
      {survey && <NmqForm key={survey.id} survey={survey} dispatchId={dispatchId} onCancel={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function NmqForm({ survey, dispatchId, onCancel, onSaved }: { survey: Survey; dispatchId: string; onCancel: () => void; onSaved: (s: Survey) => void }) {
  const [draft, setDraft] = useState<NmqDraft>(emptyNmq);
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
          : `${survey.filledAt ? dt(survey.filledAt) : ''} ${survey.filledBy === 'nurse' ? '職護代填' : '本人填寫'}，${hazardLabel(survey.maxScore)}。原本的作答不會顯示在這裡；重新填寫會取代原結果並重新判定。`}
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
