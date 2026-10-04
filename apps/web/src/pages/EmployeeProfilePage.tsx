import { Avatar, Badge, Box, Breadcrumbs, Button, Card, Grid, Group, Modal, ScrollArea, Skeleton, Stack, Table, Tabs, Text, Timeline, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data, type Schemas } from '@yutis/api-client';
import { ageAt, EVENT_TYPES, LOAD_LABEL, MATRIX, RISK_LABEL, type Grade, type Level3 } from '@yutis/domain';
import { CaseStatusBadge, GradeBadge } from '@yutis/ui';
import { useState } from 'react';
import { api } from '../api';
import { todayIso } from '../cases';
import { AnchorLink } from '../links';
import { seesHealth } from '../nav';
import { employeeCaseQuery, employeeExamsQuery, employeeQuery, employeeRecordsQuery, workAdviceQuery, workloadAssessmentsQuery } from '../queries';
import { useMe } from '../session';
import { EmployeeStatus } from './EmployeesPage';
import { CardNote, problemText } from './states';

type Exam = Schemas['ExamSummaryDto'];
type CareRecord = Schemas['RecordDto'];
type Assessment = Schemas['AssessmentDto'];

const CVD_BANDS = ['<10%', '10–20%', '≥20%'];
const RISK_TONE = ['ok', 'warn', 'bad'] as const;
const dt = (iso: string) => iso.slice(0, 10).replaceAll('-', '/');

/** Personal page. Care staff see exams, records, programmes and the case; HR sees identity and work arrangements only. */
export function EmployeeProfilePage({ id }: { id: string }) {
  const me = useMe();
  const { data: e } = useSuspenseQuery(employeeQuery(id));
  const care = seesHealth(me);
  const kase = useQuery({ ...employeeCaseQuery(id), enabled: care });
  const [tab, setTab] = useState<string | null>('overview');
  const open = kase.data && kase.data.status !== '結案' && kase.data.events.length > 0;

  return (
    <Stack gap="lg">
      <Breadcrumbs><AnchorLink to="/employees" size="sm">員工資料</AnchorLink><Text size="sm">{e.name}</Text></Breadcrumbs>

      <Card>
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="md" wrap="nowrap">
            <Avatar color="yutis" radius="lg" size={56}>{e.name[0]}</Avatar>
            <div>
              <Group gap="xs">
                <Title order={3}>{e.name}</Title>
                {e.status !== '在職' && <EmployeeStatus status={e.status} />}
                {open && <CaseStatusBadge status={kase.data.status} />}
              </Group>
              <Group gap="md" c="dimmed" fz="sm">
                <span>{e.empNo}</span>
                <span>{e.site.name} · {e.department.name}{e.title ? ` · ${e.title}` : ''}</span>
                <span>{e.sex} · {ageAt(e.birthDate, todayIso())} 歲</span>
                {e.shift && <span>{e.shift}</span>}
                <span>身分證 {e.nationalIdMasked ?? '未登錄'}</span>
              </Group>
            </div>
          </Group>
          {care && kase.data?.status === '未開單' && kase.data.events.length > 0 && <OpenCaseButton employeeId={id} />}
        </Group>
        {care && (
          <Tabs value={tab} onChange={setTab} mt="md">
            <Tabs.List>
              <Tabs.Tab value="overview">總覽</Tabs.Tab>
              <Tabs.Tab value="exams">健檢報告</Tabs.Tab>
              <Tabs.Tab value="records">協助紀錄</Tabs.Tab>
              <Tabs.Tab value="case">個案</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        )}
      </Card>

      {!care ? <WorkAdvice employeeId={id} /> : tab === 'exams' ? <ExamsTab employeeId={id} /> : tab === 'records' ? <RecordsTab employeeId={id} /> : tab === 'case' ? <CaseTab employeeId={id} /> : <Overview employeeId={id} />}
    </Stack>
  );
}

function Overview({ employeeId }: { employeeId: string }) {
  const exams = useQuery(employeeExamsQuery(employeeId));
  const records = useQuery(employeeRecordsQuery(employeeId));
  const kase = useQuery(employeeCaseQuery(employeeId));
  const assessments = useQuery(workloadAssessmentsQuery);
  const latest = exams.data?.[0];
  const abnormal = (latest?.items ?? []).filter(i => (i.grade ?? 0) >= 2).sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));
  const wl = assessments.data?.filter(a => a.employeeId === employeeId).sort((a, b) => b.sentOn.localeCompare(a.sentOn))[0];
  const timeline = [
    ...(kase.data?.events ?? []).map(ev => ({ on: ev.occurredOn, title: EVENT_TYPES[ev.type].short, detail: ev.description })),
    ...(records.data ?? []).map(r => ({ on: r.occurredAt.slice(0, 10), title: r.category, detail: r.result === '追蹤' && r.followUpOn ? `追蹤 ${dt(r.followUpOn)}` : r.result })),
  ].sort((a, b) => b.on.localeCompare(a.on)).slice(0, 6);

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
        <Card h="100%">
          {exams.isPending ? <Skeleton h={160} /> : !latest ? <><Text fw={600}>健檢</Text><CardNote>還沒有健檢紀錄。</CardNote></> : (
            <>
              <Group justify="space-between" mb="xs"><Text fw={600}>{latest.examDate.slice(0, 4)} 健檢</Text><Text size="xs" c="dimmed">總分 {latest.gradeTotal} · 最高 {latest.gradeMax} 級</Text></Group>
              <Table verticalSpacing={6}>
                <Table.Tbody>
                  {abnormal.map(i => (
                    <Table.Tr key={i.code}>
                      <Table.Td>{i.name}</Table.Td>
                      <Table.Td ta="right">{i.value ?? '—'} <Text span size="xs" c="dimmed">{i.unit}</Text></Table.Td>
                      <Table.Td w={30}><GradeBadge grade={i.grade as Grade | null} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {abnormal.length === 0 && <Text size="sm" c="dimmed">所有項目都在 1 級。</Text>}
            </>
          )}
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
        <Card h="100%">
          <WorkloadCard assessment={wl} loading={assessments.isPending} />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Card h="100%">
          <Text fw={600} mb="sm">近期紀錄</Text>
          {timeline.length === 0 ? <CardNote>還沒有異常事件或協助紀錄。</CardNote> : (
            <Timeline bulletSize={10} lineWidth={2}>
              {timeline.map((t, i) => <Timeline.Item key={i} title={t.title}><Text size="xs" c="dimmed">{dt(t.on)} · {t.detail}</Text></Timeline.Item>)}
            </Timeline>
          )}
        </Card>
      </Grid.Col>
    </Grid>
  );
}

/** Ten-year cardiovascular risk × workload, from the latest overwork assessment's evaluation. */
function WorkloadCard({ assessment, loading }: { assessment: Assessment | undefined; loading: boolean }) {
  const ev = assessment?.evaluation as { cvd?: { band?: number; risk?: number }; load?: { level?: number } } | null | undefined;
  const band = ev?.cvd?.band as Level3 | undefined;
  const load = ev?.load?.level as Level3 | undefined;
  if (loading) return <Skeleton h={160} />;
  if (band == null || load == null) return <><Text fw={600}>異常工作負荷</Text><CardNote>還沒有完成的過勞評估。</CardNote></>;
  const lv = MATRIX[band]?.[load] ?? 0;
  return (
    <>
      <Group justify="space-between" mb="xs"><Text fw={600}>異常工作負荷</Text><Text size="xs" c="dimmed">10 年心血管風險 {ev?.cvd?.risk ?? '—'}%</Text></Group>
      <Box style={{ display: 'grid', gridTemplateColumns: '64px repeat(3, 1fr)', gap: 4, textAlign: 'center', fontSize: 12 }} role="table" aria-label="異常工作負荷風險矩陣">
        <span />
        {LOAD_LABEL.map(l => <Text key={l} size="xs" c="dimmed" py={4}>{l}</Text>)}
        {MATRIX.map((row, b) => [
          <Text key={`h${b}`} size="xs" c="dimmed" py={10}>{CVD_BANDS[b]}</Text>,
          ...row.map((v, l) => {
            const here = b === band && l === load;
            const tone = RISK_TONE[v];
            return (
              <Box key={`${b}-${l}`} py={10} fw={600} aria-current={here ? 'true' : undefined} style={{
                borderRadius: 8, background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`,
                outline: here ? '2px solid var(--mantine-color-text)' : undefined, outlineOffset: -2,
              }}>{RISK_LABEL[v].slice(0, 1)}</Box>
            );
          }),
        ])}
      </Box>
      <Text size="xs" c="dimmed" mt="sm">{RISK_LABEL[lv]} · {dt(assessment!.sentOn)} 評估{assessment!.interview ? ` · 面談${assessment!.interview.status}` : ''}</Text>
    </>
  );
}

function ExamsTab({ employeeId }: { employeeId: string }) {
  const exams = useQuery(employeeExamsQuery(employeeId));
  const [selected, setSelected] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  if (exams.isPending) return <Card><Skeleton h={240} /></Card>;
  if (exams.isError) return <Card><CardNote>{problemText(exams.error)}</CardNote></Card>;
  if (exams.data.length === 0) return <Card><CardNote>還沒有健檢紀錄。</CardNote></Card>;
  const exam: Exam = exams.data[selected] ?? exams.data[0]!;
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card>
          <Stack gap={6}>
            {exams.data.map((x, i) => (
              <Box key={x.id} p="sm" onClick={() => setSelected(i)} role="button" tabIndex={0} onKeyDown={k => { if (k.key === 'Enter') setSelected(i); }}
                style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-md)', background: i === selected ? 'var(--yutis-tile-lavender)' : 'var(--yutis-surface2)' }}>
                <Group justify="space-between"><Text fw={600}>{dt(x.examDate)}</Text><GradeBadge grade={x.gradeMax as Grade} /></Group>
                <Text size="xs" c="dimmed">{x.kind}{x.clinic ? ` · ${x.clinic}` : ''}</Text>
              </Box>
            ))}
          </Stack>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        <Card>
          <Group justify="space-between" mb="sm">
            <div>
              <Text fw={600}>{dt(exam.examDate)} {exam.kind}</Text>
              <Text size="xs" c="dimmed">總分 {exam.gradeTotal} · 最高 {exam.gradeMax} 級 · 分級標準第 {exam.ruleSetVersion} 版{exam.specialHazard ? ` · 特殊作業 ${exam.specialHazard} 第 ${exam.specialLevel ?? '—'} 級管理` : ''}</Text>
            </div>
            <Button variant="default" size="xs" onClick={() => setDetailId(exam.id)}>病史與症狀</Button>
          </Group>
          <Table verticalSpacing={6} highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>項目</Table.Th><Table.Th ta="right">結果</Table.Th><Table.Th>單位</Table.Th><Table.Th>分級</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {exam.items.map(i => (
                <Table.Tr key={i.code}>
                  <Table.Td>{i.name}</Table.Td>
                  <Table.Td ta="right" fw={(i.grade ?? 0) >= 3 ? 700 : undefined}>{i.value ?? '—'}</Table.Td>
                  <Table.Td c="dimmed">{i.unit}</Table.Td>
                  <Table.Td><GradeBadge grade={i.grade as Grade | null} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Grid.Col>
      <ExamDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </Grid>
  );
}

/** History, symptoms and work notes are medical text: fetched only on request, and each read is audited. */
function ExamDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['exams', id], enabled: !!id, staleTime: 0, gcTime: 0,
    queryFn: () => data(api.GET('/api/exams/{id}', { params: { path: { id: id! } } })),
  });
  return (
    <Modal opened={!!id} onClose={onClose} title="病史與症狀" size="lg" scrollAreaComponent={ScrollArea.Autosize}>
      {detail.isPending ? <Skeleton h={120} /> : detail.isError ? <Text>{problemText(detail.error)}</Text> : (
        <Stack gap="md">
          <Field label="病史" value={detail.data.history} />
          <Field label="自覺症狀" value={detail.data.symptoms} />
          <Field label="工作相關備註" value={detail.data.workNote} />
          <Text size="xs" c="dimmed">這次查看已記入存取紀錄。</Text>
        </Stack>
      )}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Text size="sm" fw={600}>{label}</Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} c={value ? undefined : 'dimmed'}>{value || '無'}</Text>
    </div>
  );
}

function RecordsTab({ employeeId }: { employeeId: string }) {
  const records = useQuery(employeeRecordsQuery(employeeId));
  if (records.isPending) return <Card><Skeleton h={200} /></Card>;
  if (records.isError) return <Card><CardNote>{problemText(records.error)}</CardNote></Card>;
  if (records.data.length === 0) return <Card><CardNote>還沒有協助紀錄。</CardNote></Card>;
  return <Stack gap="md">{records.data.map(r => <RecordCard key={r.id} r={r} />)}</Stack>;
}

function RecordCard({ r }: { r: CareRecord }) {
  const c = r.content ?? { explain: '', handling: '', note: '' };
  return (
    <Card>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text fw={600}>{r.category}</Text>
          {r.draft && <Badge variant="light" color="gray">草稿</Badge>}
        </Group>
        <Text size="sm" c="dimmed">{new Date(r.occurredAt).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      </Group>
      {r.consultTypes.length > 0 && <Text size="xs" c="dimmed" mb="xs">{r.consultTypes.join('、')}</Text>}
      <Stack gap="xs">
        {c.explain && <Field label="說明" value={c.explain} />}
        {c.handling && <Field label="處置" value={c.handling} />}
        {r.lifestyleAdvice.length > 0 && <Field label="生活型態建議" value={r.lifestyleAdvice.join('、')} />}
        {c.note && <Field label="備註" value={c.note} />}
      </Stack>
      <Text size="sm" mt="sm">{r.result === '追蹤' ? `追蹤${r.followUpOn ? ` · ${dt(r.followUpOn)}` : ''}${r.followUpDone ? '（已完成）' : ''}` : '結案'}</Text>
    </Card>
  );
}

function CaseTab({ employeeId }: { employeeId: string }) {
  const kase = useQuery(employeeCaseQuery(employeeId));
  if (kase.isPending) return <Card><Skeleton h={200} /></Card>;
  if (kase.isError) return <Card><CardNote>{problemText(kase.error)}</CardNote></Card>;
  const k = kase.data;
  if (k.events.length === 0) return <Card><CardNote>這位員工沒有異常事件，不需要開立個案。</CardNote></Card>;
  const c = k.case;
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Card h="100%">
          <Group justify="space-between" mb="sm"><Text fw={600}>個案服務單</Text><CaseStatusBadge status={k.status} /></Group>
          {!c ? <CardNote>還沒有開單。</CardNote> : (
            <Table verticalSpacing={6}>
              <Table.Tbody>
                {([['主責', c.leadName], ['開單日', c.openedOn], ['通知日', c.noticeOn], ['預計處理日', c.plannedOn], ['回覆日', c.repliedOn],
                  ['同意處理', c.agreed == null ? null : c.agreed ? '同意' : '不同意'], ['結案日', c.closedOn]] as const).map(([label, v]) => (
                  <Table.Tr key={label}><Table.Td c="dimmed" w={110}>{label}</Table.Td><Table.Td>{v && /^\d{4}-/.test(v) ? dt(v) : v ?? '—'}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Card h="100%">
          <Text fw={600} mb="sm">異常事件</Text>
          <Table verticalSpacing={6}>
            <Table.Tbody>
              {k.events.map(ev => (
                <Table.Tr key={ev.id}>
                  <Table.Td w={96}>{dt(ev.occurredOn)}</Table.Td>
                  <Table.Td>{ev.description}</Table.Td>
                  <Table.Td w={90}><CaseStatusBadge status={ev.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {k.history.length > 0 && (
            <>
              <Text fw={600} mt="lg" mb="sm">狀態歷程</Text>
              <Timeline bulletSize={10} lineWidth={2}>
                {[...k.history].reverse().map((h, i) => (
                  <Timeline.Item key={i} title={`${h.fromStatus ?? '新事件'} → ${h.toStatus}`}>
                    <Text size="xs" c="dimmed">{new Date(h.at).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}{h.note ? ` · ${h.note}` : ''}</Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            </>
          )}
        </Card>
      </Grid.Col>
    </Grid>
  );
}

function OpenCaseButton({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const open = useMutation({
    mutationFn: () => data(api.POST('/api/employees/{employeeId}/case/open', { params: { path: { employeeId } } })),
    onSuccess: k => {
      qc.setQueryData(employeeCaseQuery(employeeId).queryKey, k);
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
  return (
    <Stack gap={4} align="flex-end">
      <Button loading={open.isPending} onClick={() => open.mutate()}>開單</Button>
      {open.isError && <Text size="xs" c="var(--yutis-bad)">{problemText(open.error)}</Text>}
    </Stack>
  );
}

/** HR: the work-arrangement conclusions they need to act on, without clinical detail. */
function WorkAdvice({ employeeId }: { employeeId: string }) {
  const advice = useQuery(workAdviceQuery);
  const mine = advice.data?.filter(a => a.employeeId === employeeId) ?? [];
  return (
    <Card>
      <Text fw={600} mb="sm">工作安排建議</Text>
      {advice.isPending ? <Skeleton h={80} /> : advice.isError ? <CardNote>{problemText(advice.error)}</CardNote> : mine.length === 0 ? (
        <Text size="sm" c="dimmed">目前沒有需要調整的工作安排。健檢數值與個案內容只有醫護人員看得到。</Text>
      ) : (
        <Stack gap="sm">
          {mine.map((a, i) => (
            <Box key={i} p="sm" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
              <Group justify="space-between"><Text fw={600}>{a.programme}</Text><Text size="xs" c="dimmed">{a.on ? dt(a.on) : ''}</Text></Group>
              <Text size="sm">{a.advice}</Text>
              {a.restrictions.length > 0 && <Text size="xs" c="dimmed">限制：{a.restrictions.join('、')}</Text>}
            </Box>
          ))}
        </Stack>
      )}
    </Card>
  );
}
