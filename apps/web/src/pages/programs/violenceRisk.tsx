/* 不法侵害預防 · 辨識及評估危害: likelihood × severity per potential risk (職護、職醫、職安衛人員). */
import { Box, Button, Card, Checkbox, Group, Modal, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { violenceRisk, VIO_LIKELIHOOD, VIO_SEVERITY, type VioLikelihood, type VioRisk, type VioSeverity } from '@yutis/domain';
import { Fragment, useState } from 'react';
import { api } from '../../api';
import { todayIso } from '../../cases';
import { CardNote, problemText } from '../states';
import { OrgFilterSelects } from './listControls';
import { matchOrg, NO_ORG_FILTER, type OrgFilter } from './lists';
import { DateField, dt, Kv, saveProblem, ToneBadge, useModalSize, useMySites, useOrgNames, useSiteName } from './maternalViolenceCommon';
import { countByRisk, emptyRiskDraft, RISK_TONE, riskBody, riskRows, VIO_QUESTIONS, type RiskAssessment, type RiskDraftRow } from './violence';
import { riskAssessmentsQuery } from './violenceQueries';

export function RiskBadge({ risk }: { risk: VioRisk | null }) {
  return risk ? <ToneBadge tone={RISK_TONE[risk]}>{risk}</ToneBadge> : <Text span size="sm" c="dimmed">—</Text>;
}

const Count = ({ n, risk }: { n: number; risk: VioRisk }) => (n ? <ToneBadge tone={RISK_TONE[risk]}>{n}</ToneBadge> : <Text span size="sm" c="dimmed">0</Text>);

export function ViolenceRiskTab({ risks }: { risks: UseQueryResult<RiskAssessment[]> }) {
  const names = useOrgNames();
  const sites = useMySites();
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<RiskAssessment | null>(null);
  const rows = (risks.data ?? []).filter(r => matchOrg(r, org));
  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Group gap="sm">
          <OrgFilterSelects rows={risks.data ?? []} names={names} value={org} onChange={setOrg} />
          <Text size="sm" c="dimmed">風險等級 = 可能性 × 嚴重性，系統自動計算。</Text>
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating(true)} disabled={!sites.length}>新增評估</Button>
      </Group>
      {risks.isPending ? <Skeleton h={200} /> : risks.isError ? <CardNote>{problemText(risks.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>評估日期</Table.Th><Table.Th>廠區</Table.Th><Table.Th ta="right">潛在風險</Table.Th><Table.Th ta="center">高度</Table.Th><Table.Th ta="center">中度</Table.Th><Table.Th ta="center">低度</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(r => {
                  const c = countByRisk(riskRows(r.items));
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>{dt(r.assessedOn)}</Table.Td>
                      <Table.Td>{names.site(r.siteId)}</Table.Td>
                      <Table.Td ta="right">{r.items.length} 項</Table.Td>
                      <Table.Td ta="center"><Count n={c['高度風險']} risk="高度風險" /></Table.Td>
                      <Table.Td ta="center"><Count n={c['中度風險']} risk="中度風險" /></Table.Td>
                      <Table.Td ta="center"><Count n={c['低度風險']} risk="低度風險" /></Table.Td>
                      <Table.Td ta="right"><Button variant="default" size="xs" onClick={() => setViewing(r)}>檢視</Button></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{risks.data.length ? '沒有符合條件的評估。' : '還沒有不法侵害危害辨識及風險評估。'}</CardNote>}
        </>
      )}
      <NewRiskModal opened={creating} onClose={() => setCreating(false)} />
      <RiskDetailModal assessment={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

function RiskDetailModal({ assessment, onClose }: { assessment: RiskAssessment | null; onClose: () => void }) {
  const siteName = useSiteName();
  const size = useModalSize('xl');
  const rows = assessment ? riskRows(assessment.items) : [];
  return (
    <Modal opened={!!assessment} onClose={onClose} title="不法侵害危害辨識及風險評估" {...size}>
      {assessment && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
            <Kv label="評估日期" value={dt(assessment.assessedOn)} />
            <Kv label="廠區" value={siteName(assessment.siteId)} />
            <Kv label="潛在風險" value={`${rows.length} 項`} />
          </SimpleGrid>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing={6}>
              <Table.Thead><Table.Tr><Table.Th>潛在風險</Table.Th><Table.Th>可能性</Table.Th><Table.Th>嚴重性</Table.Th><Table.Th>風險等級</Table.Th><Table.Th>現有控制措施</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((r, i) => (
                  <Table.Tr key={i}>
                    <Table.Td maw={360}>{r.question}</Table.Td>
                    <Table.Td>{r.likelihood || '—'}</Table.Td>
                    <Table.Td>{r.severity || '—'}</Table.Td>
                    <Table.Td><RiskBadge risk={r.risk} /></Table.Td>
                    <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{r.controls || '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      )}
    </Modal>
  );
}

function NewRiskModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const size = useModalSize('xl');
  return (
    <Modal opened={opened} onClose={onClose} title="新增不法侵害危害辨識及風險評估" {...size}>
      {opened && <NewRiskForm onDone={onClose} />}
    </Modal>
  );
}

function NewRiskForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const sites = useMySites();
  const today = todayIso();
  const [assessedOn, setAssessedOn] = useState(today);
  const [siteId, setSiteId] = useState<string | null>(sites[0]?.id ?? null);
  const [rows, setRows] = useState<RiskDraftRow[]>(emptyRiskDraft);
  const [tried, setTried] = useState(false);
  const body = riskBody(rows);
  const problem = !assessedOn ? '請填寫評估日期。' : assessedOn > today ? '評估日期不能晚於今天。' : !siteId ? '請選擇廠區。' : 'problem' in body ? body.problem : null;
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/programs/violence/risk-assessments', { body: { siteId: siteId!, assessedOn, items: 'items' in body ? body.items : [] } })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: riskAssessmentsQuery.queryKey }); onDone(); },
  });
  const setRow = (i: number, patch: Partial<RiskDraftRow>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const groupOf = (i: number) => VIO_QUESTIONS[i]?.group ?? '其他潛在風險';

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <DateField label="評估日期" required max={today} value={assessedOn} onChange={e => setAssessedOn(e.currentTarget.value)} />
        <Select label="廠區" required value={siteId} onChange={setSiteId} data={sites.map(s => ({ value: s.id, label: s.name }))} allowDeselect={false} />
      </SimpleGrid>
      <Text size="sm" c="dimmed">勾選該場所存在的潛在風險，再評估可能性與嚴重性。</Text>
      <Stack gap="xs">
        {rows.map((r, i) => (
          <Fragment key={i}>
            {groupOf(i) !== groupOf(i - 1) && <Text fw={600} mt={i ? 'sm' : 0}>{groupOf(i)}</Text>}
            <Box p="sm" style={{ background: r.applies ? 'var(--yutis-tile-lavender)' : 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
              {r.custom
                ? <Textarea size="sm" autosize minRows={1} placeholder="描述潛在風險" maxLength={300} value={r.question} onChange={e => setRow(i, { question: e.currentTarget.value })} aria-label="其他潛在風險" mb="xs" />
                : <Checkbox checked={r.applies} onChange={e => setRow(i, { applies: e.currentTarget.checked })} label={r.question} />}
              {r.applies && (
                <Group gap="sm" mt="xs" align="flex-end" wrap="wrap" pl={r.custom ? 0 : 30}>
                  <Select size="xs" label="可能性" w={120} data={[...VIO_LIKELIHOOD]} value={r.likelihood} onChange={v => setRow(i, { likelihood: v as VioLikelihood | null })}
                    error={tried && !r.likelihood ? '請選擇' : undefined} />
                  <Select size="xs" label="嚴重性" w={100} data={[...VIO_SEVERITY]} value={r.severity} onChange={v => setRow(i, { severity: v as VioSeverity | null })}
                    error={tried && !r.severity ? '請選擇' : undefined} />
                  <Box pb={4}><RiskBadge risk={violenceRisk(r.likelihood, r.severity)} /></Box>
                  <TextInput size="xs" label="現有控制措施" placeholder="工程控制、管理控制、個人防護" maxLength={1000} style={{ flex: 1, minWidth: 200 }}
                    value={r.controls} onChange={e => setRow(i, { controls: e.currentTarget.value })} />
                  {r.custom && <Button size="xs" variant="subtle" color="gray" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>移除</Button>}
                </Group>
              )}
            </Box>
          </Fragment>
        ))}
      </Stack>
      <Group>
        <Button size="xs" variant="default" leftSection={<IconPlus size={14} />}
          onClick={() => setRows(rs => [...rs, { question: '', applies: true, likelihood: null, severity: null, controls: '', custom: true }])}>新增其他潛在風險</Button>
      </Group>
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate(); }}>儲存</Button>
      </Group>
    </Stack>
  );
}
