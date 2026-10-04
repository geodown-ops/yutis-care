/* 母性健康保護 · 個人評估: pregnancy and postpartum notifications and their interviews (職護、職醫 only). */
import { Box, Button, Card, Chip, Group, Modal, Radio, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { data, type Schemas } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { todayIso } from '../../cases';
import { workAdviceQuery } from '../../queries';
import { ConfirmLinkPanel } from '../advice/ConfirmLinkPanel';
import { CardNote, problemText } from '../states';
import {
  caseDraftProblem, composeArrangement, composeDetail, FIT_ADVICE, FIT_LIMITS, isPostpartum, MAT_AGREE, MAT_SELF, typeLabel,
  type CaseDraft, type EnvAssessment, type MaternalCase, type WorkAdvice,
} from './maternal';
import { LevelBadge } from './maternalEnv';
import { maternalCasesQuery } from './maternalQueries';
import { DateField, dt, EmployeePicker, Kv, PersonLink, saveProblem, ToneBadge, useModalSize, useSiteName } from './maternalViolenceCommon';

type Employee = Schemas['EmployeeDto'];

export function MaternalCasesTab({ cases, interviews, envs }: {
  cases: UseQueryResult<MaternalCase[]>; interviews: Map<string, WorkAdvice[]>; envs: EnvAssessment[];
}) {
  const [type, setType] = useState<'all' | '妊娠' | '產後'>('all');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<MaternalCase | null>(null);
  const rows = (cases.data ?? []).filter(c => type === 'all' || (type === '產後' ? isPostpartum(c.type) : c.type === type));
  // A just-created case may not be in the refetched list yet.
  const open = cases.data?.find(c => c.id === openId) ?? (fresh?.id === openId ? fresh : null);

  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <SegmentedControl size="xs" value={type} onChange={v => setType(v as typeof type)} aria-label="通報類型"
          data={[{ value: 'all', label: '全部' }, { value: '妊娠', label: '妊娠' }, { value: '產後', label: '產後一年內' }]} />
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating(true)}>新增通報</Button>
      </Group>
      {cases.isPending ? <Skeleton h={200} /> : cases.isError ? <CardNote>{problemText(cases.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>通報日期</Table.Th><Table.Th>類型</Table.Th><Table.Th>員工</Table.Th><Table.Th>預產期</Table.Th><Table.Th ta="right">懷孕週數</Table.Th><Table.Th>作業環境</Table.Th><Table.Th>最近面談</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(c => {
                  const last = interviews.get(c.id)?.[0];
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td>{dt(c.notifiedOn)}</Table.Td>
                      <Table.Td><ToneBadge tone={isPostpartum(c.type) ? 'info' : 'warn'}>{typeLabel(c.type)}</ToneBadge></Table.Td>
                      <Table.Td><PersonLink employeeId={c.employeeId} name={c.name} /></Table.Td>
                      <Table.Td>{dt(c.dueDate)}</Table.Td>
                      <Table.Td ta="right">{c.weeks != null ? `${c.weeks} 週` : '—'}</Table.Td>
                      <Table.Td><LevelBadge level={c.level} /></Table.Td>
                      <Table.Td>{last ? dt(last.on) : <Text span size="sm" c="dimmed">未面談</Text>}</Table.Td>
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
      <NewCaseModal opened={creating} envs={envs} onClose={() => setCreating(false)} onCreated={c => { setCreating(false); setFresh(c); setOpenId(c.id); }} />
      <CaseModal kase={open} interviews={open ? interviews.get(open.id) ?? [] : []} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function NewCaseModal({ opened, envs, onClose, onCreated }: { opened: boolean; envs: EnvAssessment[]; onClose: () => void; onCreated: (c: MaternalCase) => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={opened} onClose={onClose} title="新增妊娠或產後一年內通報" {...size}>
      {opened && <NewCaseForm envs={envs} onCancel={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function NewCaseForm({ envs, onCancel, onCreated }: { envs: EnvAssessment[]; onCancel: () => void; onCreated: (c: MaternalCase) => void }) {
  const qc = useQueryClient();
  const siteName = useSiteName();
  const today = todayIso();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<Omit<CaseDraft, 'employeeId'>>({ type: '妊娠', notifiedOn: today, dueDate: '', birthDate: '' });
  const [envId, setEnvId] = useState<string | null>(null);
  const [selfItems, setSelfItems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const problem = caseDraftProblem({ ...draft, employeeId: employee?.id ?? null }, today);
  const envOptions = envs.filter(e => !employee || e.siteId === employee.site.id)
    .map(e => ({ value: e.id, label: `${e.area}（${e.level}）· ${siteName(e.siteId)} ${dt(e.assessedOn)}` }));
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

function CaseModal({ kase, interviews, onClose }: { kase: MaternalCase | null; interviews: WorkAdvice[]; onClose: () => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={!!kase} onClose={onClose} title={kase ? `母性健康保護 · ${kase.name}` : ''} {...size}>
      {kase && <CaseDetail key={kase.id} kase={kase} interviews={interviews} />}
    </Modal>
  );
}

function CaseDetail({ kase, interviews }: { kase: MaternalCase; interviews: WorkAdvice[] }) {
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<{ id: string; acknowledgementId: string | null } | null>(null);
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <Kv label="員工" value={<PersonLink employeeId={kase.employeeId} name={kase.name} />} />
        <Kv label="通報" value={`${typeLabel(kase.type)} · ${dt(kase.notifiedOn)}`} />
        <Kv label="作業環境分級" value={<LevelBadge level={kase.level} />} />
        {!isPostpartum(kase.type) && <Kv label="預產期" value={dt(kase.dueDate)} />}
        {!isPostpartum(kase.type) && <Kv label="目前懷孕週數" value={kase.weeks != null ? `${kase.weeks} 週` : '—'} />}
      </SimpleGrid>
      <div>
        <Text size="sm" fw={600} mb={4}>自述症狀與風險因子</Text>
        <Text size="sm" c={kase.detail ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>{kase.detail || '未填寫'}</Text>
      </div>

      <div>
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={600}>面談與工作安排建議</Text>
          {!adding && !saved && <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => setAdding(true)}>新增面談紀錄</Button>}
        </Group>
        {interviews.length === 0 && !adding && !saved && <Text size="sm" c="dimmed">還沒有面談紀錄。</Text>}
        <Stack gap="xs">
          {interviews.map((a, i) => (
            <Box key={`${a.on}-${i}`} p="sm" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
              <Text size="xs" c="dimmed">{dt(a.on)} 面談</Text>
              <Text size="sm">{a.advice || '—'}</Text>
              {a.restrictions.length > 0 && <Text size="xs" c="dimmed">條件限制：{a.restrictions.join('、')}</Text>}
            </Box>
          ))}
        </Stack>
      </div>

      {adding && <InterviewForm caseId={kase.id} onCancel={() => setAdding(false)} onSaved={r => { setAdding(false); setSaved(r); }} />}
      {saved && (
        <Stack gap="sm">
          <Text size="sm" c="var(--yutis-ok)" fw={600}>已儲存面談紀錄。</Text>
          {saved.acknowledgementId && <ConfirmLinkPanel acknowledgementId={saved.acknowledgementId} />}
        </Stack>
      )}
    </Stack>
  );
}

function InterviewForm({ caseId, onCancel, onSaved }: { caseId: string; onCancel: () => void; onSaved: (r: { id: string; acknowledgementId: string | null }) => void }) {
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
    onSuccess: r => {
      void qc.invalidateQueries({ queryKey: workAdviceQuery.queryKey });
      // The API also returns the acknowledgement it opened for the employee; the generated type does not declare it yet.
      const ack = (r as { acknowledgementId?: unknown }).acknowledgementId;
      onSaved({ id: r.id, acknowledgementId: typeof ack === 'string' ? ack : null });
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
