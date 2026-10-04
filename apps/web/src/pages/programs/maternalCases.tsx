/* 母性健康保護 · 個人評估: pregnancy and postpartum notifications and their interviews (職護、職醫 only). */
import { Alert, Box, Button, Card, Chip, Group, Modal, Radio, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { data, type Schemas } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { todayIso } from '../../cases';
import { employeeQuery, workAdviceQuery } from '../../queries';
import { ACK_LABEL, ACK_TONE, maternalNoticeText } from '../advice/advice';
import { InterviewFollowUp } from '../advice/InterviewFollowUp';
import { CardNote, problemText } from '../states';
import { OrgFilterSelects } from './listControls';
import { matchOrg, NO_ORG_FILTER, withRowDepartments, type OrgFilter } from './lists';
import {
  caseAckState, caseDraftProblem, composeArrangement, composeDetail, FIT_ADVICE, FIT_LIMITS, interviewsNewestFirst, isPostpartum, keyDate, latestInterview, MAT_AGREE,
  MAT_SELF, stageOf, typeLabel, type CaseDraft, type EnvAssessment, type MaternalCase, type MaternalInterview,
} from './maternal';
import { LevelBadge } from './maternalEnv';
import { maternalCasesQuery } from './maternalQueries';
import { DateField, dt, EmployeePicker, Kv, PersonLink, saveProblem, ToneBadge, useModalSize, useOrgNames } from './maternalViolenceCommon';

type Employee = Schemas['EmployeeDto'];
/** A new notification can start from an employee and type, e.g. the 產後 notification after a pregnancy. */
interface Preset { employee: Employee; type: CaseDraft['type'] }

/** 員工確認 of the case's latest interview. */
export function CaseAckBadge({ c }: { c: Pick<MaternalCase, 'interviews'> }) {
  const s = caseAckState(c);
  return s === 'no-interview' ? <Text span size="sm" c="dimmed">—</Text> : <ToneBadge tone={ACK_TONE[s]}>{ACK_LABEL[s]}</ToneBadge>;
}

function StageCell({ c, today }: { c: MaternalCase; today: string }) {
  if (stageOf(c, today) === '已過預產期') return <ToneBadge tone="warn">已過預產期</ToneBadge>;
  return <>{c.weeks != null ? `${c.weeks} 週` : '—'}</>;
}

export function MaternalCasesTab({ cases, envs }: { cases: UseQueryResult<MaternalCase[]>; envs: EnvAssessment[] }) {
  const today = todayIso();
  const [type, setType] = useState<'all' | '妊娠' | '產後'>('all');
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [creating, setCreating] = useState<Preset | 'blank' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<MaternalCase | null>(null);
  // Cases carry the employee's current site and department; only site names come from the organisation tree.
  const names = withRowDepartments(useOrgNames(), cases.data ?? []);
  const rows = (cases.data ?? []).filter(c => (type === 'all' || c.type === type) && matchOrg(c, org));
  // A just-created case may not be in the refetched list yet.
  const open = cases.data?.find(c => c.id === openId) ?? (fresh?.id === openId ? fresh : null);

  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Group gap="sm">
          <SegmentedControl size="xs" value={type} onChange={v => setType(v as typeof type)} aria-label="通報類型"
            data={[{ value: 'all', label: '全部' }, { value: '妊娠', label: '妊娠' }, { value: '產後', label: '產後一年內' }]} />
          <OrgFilterSelects rows={cases.data ?? []} names={names} value={org} onChange={setOrg} />
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating('blank')}>新增通報</Button>
      </Group>
      {cases.isPending ? <Skeleton h={200} /> : cases.isError ? <CardNote>{problemText(cases.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={980}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>通報日期</Table.Th><Table.Th>類型</Table.Th><Table.Th>員工</Table.Th><Table.Th>預產期／分娩日</Table.Th><Table.Th ta="right">懷孕週數</Table.Th>
                  <Table.Th>作業環境</Table.Th><Table.Th>最近面談</Table.Th><Table.Th>員工確認</Table.Th><Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(c => {
                  const last = latestInterview(c);
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{dt(c.notifiedOn)}</Table.Td>
                      <Table.Td><ToneBadge tone={isPostpartum(c.type) ? 'info' : 'warn'}>{typeLabel(c.type)}</ToneBadge></Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <PersonLink employeeId={c.employeeId} name={c.name} empNo={c.empNo} />
                        <Text size="xs" c="dimmed">{c.departmentName}</Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{dt(keyDate(c).date)}</Table.Td>
                      <Table.Td ta="right"><StageCell c={c} today={today} /></Table.Td>
                      <Table.Td><LevelBadge level={c.level} /></Table.Td>
                      <Table.Td>{last ? dt(last.interviewedOn) : <Text span size="sm" c="dimmed">未面談</Text>}</Table.Td>
                      <Table.Td><CaseAckBadge c={c} /></Table.Td>
                      <Table.Td ta="right"><Button variant="default" size="xs" onClick={() => setOpenId(c.id)}>開啟</Button></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{cases.data.length ? '沒有這個類型的通報。' : '還沒有妊娠或產後通報。員工告知懷孕或產後復工時，按「新增通報」建立。'}</CardNote>}
        </>
      )}
      <NewCaseModal opened={!!creating} preset={creating === 'blank' ? null : creating} envs={envs} onClose={() => setCreating(null)}
        onCreated={c => { setCreating(null); setFresh(c); setOpenId(c.id); }} />
      <CaseModal kase={open} today={today} onClose={() => setOpenId(null)} onPostpartum={p => { setOpenId(null); setCreating(p); }} />
    </Card>
  );
}

function NewCaseModal({ opened, preset, envs, onClose, onCreated }: {
  opened: boolean; preset: Preset | null; envs: EnvAssessment[]; onClose: () => void; onCreated: (c: MaternalCase) => void;
}) {
  const size = useModalSize('lg');
  return (
    <Modal opened={opened} onClose={onClose} title="新增妊娠或產後一年內通報" {...size}>
      {opened && <NewCaseForm preset={preset} envs={envs} onCancel={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function NewCaseForm({ preset, envs, onCancel, onCreated }: { preset: Preset | null; envs: EnvAssessment[]; onCancel: () => void; onCreated: (c: MaternalCase) => void }) {
  const qc = useQueryClient();
  const names = useOrgNames();
  const today = todayIso();
  const [employee, setEmployee] = useState<Employee | null>(preset?.employee ?? null);
  const [draft, setDraft] = useState<Omit<CaseDraft, 'employeeId'>>({ type: preset?.type ?? '妊娠', notifiedOn: today, dueDate: '', birthDate: '' });
  const [envId, setEnvId] = useState<string | null>(null);
  const [selfItems, setSelfItems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const problem = caseDraftProblem({ ...draft, employeeId: employee?.id ?? null }, today);
  const envOptions = envs.filter(e => !employee || e.siteId === employee.site.id).map(e => ({
    value: e.id,
    label: `${e.area}（${e.level}）· ${names.site(e.siteId)}${e.departmentId ? ` ${names.department(e.departmentId)}` : ''} ${dt(e.assessedOn)}`,
  }));
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/programs/maternal/cases', {
      body: {
        employeeId: employee!.id, type: draft.type, notifiedOn: draft.notifiedOn,
        dueDate: draft.type === '妊娠' ? draft.dueDate : null, birthDate: draft.type === '產後' ? draft.birthDate : null,
        envAssessmentId: envId, detail: composeDetail(selfItems, note),
      },
    })),
    onSuccess: c => {
      void qc.invalidateQueries({ queryKey: maternalCasesQuery.queryKey });
      // The notification raises a 母性 event for case management.
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['employees', c.employeeId, 'case'] });
      onCreated(c);
    },
  });
  const set = (patch: Partial<typeof draft>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <Stack gap="md">
      {preset?.type === '產後' && <Text size="sm" c="dimmed">分娩後一年內仍受母性健康保護。請填分娩日期，並依產後狀況重新評估與面談。</Text>}
      <EmployeePickerFemale value={employee} onChange={e => { setEmployee(e); setEnvId(null); }} error={tried && !employee ? '請選擇員工' : undefined} />
      {employee && <Text size="xs" c="dimmed" mt={-8}>{employee.site.name} · {employee.department.name}{employee.title ? ` · ${employee.title}` : ''}{employee.shift ? ` · ${employee.shift}` : ''}</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>通報類型</Text>
          <SegmentedControl fullWidth value={draft.type} onChange={v => set({ type: v as CaseDraft['type'] })}
            data={[{ value: '妊娠', label: '妊娠' }, { value: '產後', label: '產後一年內' }]} aria-label="通報類型" />
        </div>
        <DateField label="通報日期" required max={today} value={draft.notifiedOn} onChange={e => set({ notifiedOn: e.currentTarget.value })} />
        {draft.type === '妊娠'
          ? <DateField label="預產期" required value={draft.dueDate} onChange={e => set({ dueDate: e.currentTarget.value })} />
          : <DateField label="分娩日期" required max={today} value={draft.birthDate} onChange={e => set({ birthDate: e.currentTarget.value })} />}
        <Select label="對應的作業環境危害評估" placeholder={envOptions.length ? '選擇評估（選填）' : '這個廠區還沒有評估'} clearable
          data={envOptions} value={envId} onChange={setEnvId} disabled={!envOptions.length} description="帶入作業區域的管理分級" />
      </SimpleGrid>
      <div>
        <Text size="sm" fw={500} mb={6}>自述症狀與風險因子（選填）</Text>
        <Chip.Group multiple value={selfItems} onChange={setSelfItems}>
          <Group gap={6}>{MAT_SELF.map(s => <Chip key={s} value={s} size="xs">{s}</Chip>)}</Group>
        </Chip.Group>
        <Textarea mt="sm" placeholder="補充說明" autosize minRows={2} maxLength={2000} value={note} onChange={e => setNote(e.currentTarget.value)} aria-label="補充說明" />
        <Text size="xs" c="dimmed" mt={4}>屬醫療資料，加密儲存，只有職護、職醫看得到。</Text>
      </div>
      <Text size="sm" c="dimmed">送出後會產生「母性健康保護」異常事件，進入個案管理。</Text>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate(); }}>送出通報</Button>
      </Group>
    </Stack>
  );
}

function EmployeePickerFemale(props: { value: Employee | null; onChange: (e: Employee | null) => void; error?: string }) {
  return <EmployeePicker label="員工" required description="只列出在職的女性員工" filter={e => e.sex === '女'} {...props} />;
}

function CaseModal({ kase, today, onClose, onPostpartum }: { kase: MaternalCase | null; today: string; onClose: () => void; onPostpartum: (p: Preset) => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={!!kase} onClose={onClose} title={kase ? `母性健康保護 · ${kase.name}` : ''} {...size}>
      {kase && <CaseDetail key={kase.id} kase={kase} today={today} onPostpartum={onPostpartum} />}
    </Modal>
  );
}

/** Keeps the cached case list in step with a sent link or notice, without reading (and auditing) every case again. */
function usePatchInterview(caseId: string) {
  const qc = useQueryClient();
  return (interviewId: string, patch: (iv: MaternalInterview) => MaternalInterview) =>
    qc.setQueryData(maternalCasesQuery.queryKey, list => list?.map(c => (c.id !== caseId ? c : {
      ...c, interviews: c.interviews.map(i => (i.id === interviewId ? patch(i) : i)),
    })));
}

function CaseDetail({ kase, today, onPostpartum }: { kase: MaternalCase; today: string; onPostpartum: (p: Preset) => void }) {
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const patch = usePatchInterview(kase.id);
  const stage = stageOf(kase, today);
  const key = keyDate(kase);
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <Kv label="員工" value={<PersonLink employeeId={kase.employeeId} name={kase.name} empNo={kase.empNo} />} />
        <Kv label="部門" value={kase.departmentName} />
        <Kv label="通報" value={`${typeLabel(kase.type)} · ${dt(kase.notifiedOn)}`} />
        <Kv label="作業環境分級" value={<LevelBadge level={kase.level} />} />
        <Kv label={key.label} value={dt(key.date)} />
        {!isPostpartum(kase.type) && <Kv label="目前懷孕週數" value={stage === '已過預產期' ? '已過預產期' : kase.weeks != null ? `${kase.weeks} 週` : '—'} />}
      </SimpleGrid>
      {stage === '已過預產期' && <PostpartumPrompt kase={kase} onPostpartum={onPostpartum} />}
      <div>
        <Text size="sm" fw={600} mb={4}>自述症狀與風險因子</Text>
        <Text size="sm" c={kase.detail ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>{kase.detail || '未填寫'}</Text>
      </div>

      <div>
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={600}>面談與工作安排建議</Text>
          {!adding && <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => { setAdding(true); setSaved(false); }}>新增面談紀錄</Button>}
        </Group>
        {saved && <Text size="sm" c="var(--yutis-ok)" fw={600} mb="xs">已儲存面談紀錄。員工可在員工端確認，也可以產生確認連結給員工。</Text>}
        {adding && <InterviewForm caseId={kase.id} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); setSaved(true); }} />}
        {kase.interviews.length === 0 && !adding && <Text size="sm" c="dimmed">還沒有面談紀錄。</Text>}
        <Stack gap="sm" mt={adding ? 'md' : 0}>
          {interviewsNewestFirst(kase).map(iv => (
            <Box key={iv.id} p="sm" style={{ border: '1px solid var(--yutis-line)', borderRadius: 'var(--mantine-radius-md)' }}>
              <Text size="xs" c="dimmed">{dt(iv.interviewedOn)} 面談</Text>
              <Text size="sm" fw={500}>{iv.fitAdvice || '—'}</Text>
              {iv.limits.length > 0 && <Text size="sm">條件限制：{iv.limits.join('、')}</Text>}
              {iv.agreedArrangement && <Text size="sm">建議員工接受：{iv.agreedArrangement}</Text>}
              <Box mt="sm">
                <InterviewFollowUp employee={{ id: kase.employeeId, name: kase.name }} subjectTable="maternal_interviews" subjectId={iv.id}
                  advice={maternalNoticeText(iv)} acknowledgement={iv.acknowledgement} notices={iv.notices}
                  onAcknowledgementSent={sentAt => patch(iv.id, i => ({ ...i, acknowledgement: i.acknowledgement && { ...i.acknowledgement, sentAt } }))}
                  onNoticeSent={n => patch(iv.id, i => ({ ...i, notices: [...i.notices, n] }))} />
              </Box>
            </Box>
          ))}
        </Stack>
      </div>
    </Stack>
  );
}

/** Past the due date: the year after birth is protected too, under its own 產後 notification. */
function PostpartumPrompt({ kase, onPostpartum }: { kase: MaternalCase; onPostpartum: (p: Preset) => void }) {
  const employee = useQuery({ ...employeeQuery(kase.employeeId), staleTime: 5 * 60_000 });
  return (
    <Alert color="yellow" variant="light" title="已過預產期">
      <Text size="sm" mb="xs">員工分娩後一年內仍受母性健康保護。確認分娩日期後，請新增產後一年內通報，重新評估作業環境並安排面談。</Text>
      <Button size="xs" variant="default" disabled={!employee.data} loading={employee.isPending}
        onClick={() => employee.data && onPostpartum({ employee: employee.data, type: '產後' })}>新增產後一年內通報</Button>
      {employee.isError && <Text size="xs" c="var(--yutis-bad)" mt={4}>{problemText(employee.error)}</Text>}
    </Alert>
  );
}

function InterviewForm({ caseId, onCancel, onSaved }: { caseId: string; onCancel: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const today = todayIso();
  const [interviewedOn, setInterviewedOn] = useState(today);
  const [fitAdvice, setFitAdvice] = useState('');
  const [limits, setLimits] = useState<string[]>([]);
  const [agreed, setAgreed] = useState<string[]>([]);
  const [agreedNote, setAgreedNote] = useState('');
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const problem = !interviewedOn ? '請填寫面談日期。' : interviewedOn > today ? '面談日期不能晚於今天。' : !fitAdvice ? '請選擇工作適性安排建議。' : null;
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/programs/maternal/cases/{id}/interviews', {
      params: { path: { id: caseId } },
      body: { interviewedOn, fitAdvice, limits, agreedArrangement: composeArrangement(agreed, agreedNote), notes: notes.trim() || null },
    })),
    onSuccess: async () => {
      // The case list now carries the interview with its 員工確認 record.
      await qc.invalidateQueries({ queryKey: maternalCasesQuery.queryKey });
      void qc.invalidateQueries({ queryKey: workAdviceQuery.queryKey });
      onSaved();
    },
  });

  return (
    <Stack gap="md" p="md" style={{ border: '1px solid var(--yutis-line-strong)', borderRadius: 'var(--mantine-radius-md)' }}>
      <Text fw={600}>新增面談紀錄</Text>
      <DateField label="面談日期" required max={today} value={interviewedOn} onChange={e => setInterviewedOn(e.currentTarget.value)} maw={220} />
      <Radio.Group label="工作適性安排建議" required value={fitAdvice} onChange={setFitAdvice} error={tried && !fitAdvice ? '請選擇一項' : undefined}>
        <Stack gap={6} mt={6}>{FIT_ADVICE.map(f => <Radio key={f} value={f} label={f} />)}</Stack>
      </Radio.Group>
      <div>
        <Text size="sm" fw={500} mb={6}>條件限制</Text>
        <Chip.Group multiple value={limits} onChange={setLimits}>
          <Group gap={6}>{FIT_LIMITS.map(l => <Chip key={l} value={l} size="xs">{l}</Chip>)}</Group>
        </Chip.Group>
      </div>
      <div>
        <Text size="sm" fw={500} mb={6}>建議員工接受之事項</Text>
        <Chip.Group multiple value={agreed} onChange={setAgreed}>
          <Group gap={6}>{MAT_AGREE.map(a => <Chip key={a} value={a} size="xs">{a}</Chip>)}</Group>
        </Chip.Group>
        <TextInput mt="xs" placeholder="補充說明，例如產檢日彈性請假" maxLength={500} value={agreedNote} onChange={e => setAgreedNote(e.currentTarget.value)} aria-label="建議事項補充說明" />
      </div>
      <Textarea label="面談紀錄" description="工作環境危害、健康問題、採取措施與衛教內容。加密儲存，只有職護、職醫看得到。" autosize minRows={3} maxLength={10000}
        value={notes} onChange={e => setNotes(e.currentTarget.value)} />
      <Text size="xs" c="dimmed">工作適性建議、條件限制與建議事項會給人資執行，並請員工在員工端確認；面談紀錄不會。</Text>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate(); }}>儲存面談紀錄</Button>
      </Group>
    </Stack>
  );
}
