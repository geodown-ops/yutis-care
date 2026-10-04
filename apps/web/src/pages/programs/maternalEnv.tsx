/* 母性健康保護 · 環境危害辨識: workplace assessments (職護、職醫、職安衛人員). */
import { Box, Button, Card, Group, Modal, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { MAT_LEVELS, type MatLevel } from '@yutis/domain';
import { useState } from 'react';
import { api } from '../../api';
import { todayIso } from '../../cases';
import { CardNote, problemText } from '../states';
import {
  emptyHazards, HAZARD_ANSWERS, hazardFindings, hazardsBody, LEVEL_TONE, MAT_HAZARDS, SHIFT_TYPES, suggestedLevel,
  type EnvAssessment, type HazardAnswer, type HazardDraft,
} from './maternal';
import { envAssessmentsQuery } from './maternalQueries';
import { DateField, DepartmentSelect, dt, Kv, saveProblem, ToneBadge, useModalSize, useMySites, useSiteName } from './maternalViolenceCommon';

export function LevelBadge({ level }: { level: MatLevel | null | undefined }) {
  if (!level) return <Text span size="sm" c="dimmed">未評估</Text>;
  return <ToneBadge tone={LEVEL_TONE[level]}>{level}</ToneBadge>;
}

export function MaternalEnvTab({ envs }: { envs: UseQueryResult<EnvAssessment[]> }) {
  const sites = useMySites();
  const siteName = useSiteName();
  const [site, setSite] = useState<string | null>(null);
  const [level, setLevel] = useState<MatLevel | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<EnvAssessment | null>(null);
  const rows = (envs.data ?? []).filter(e => (!site || e.siteId === site) && (level === 'all' || e.level === level));

  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Group gap="sm">
          {sites.length > 1 && <Select aria-label="廠區" placeholder="全部廠區" clearable w={150} value={site} onChange={setSite} data={sites.map(s => ({ value: s.id, label: s.name }))} />}
          <SegmentedControl size="xs" value={level} onChange={v => setLevel(v as typeof level)} aria-label="管理分級"
            data={[{ value: 'all', label: '全部' }, ...MAT_LEVELS.map(l => ({ value: l, label: l.replace('管理', '') }))]} />
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreating(true)} disabled={!sites.length}>新增評估</Button>
      </Group>
      {envs.isPending ? <Skeleton h={200} /> : envs.isError ? <CardNote>{problemText(envs.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>評估日期</Table.Th><Table.Th>廠區</Table.Th><Table.Th>評估區域</Table.Th><Table.Th>危害判定</Table.Th><Table.Th>管理分級</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(e => {
                  const found = hazardFindings(e.hazards);
                  return (
                    <Table.Tr key={e.id}>
                      <Table.Td>{dt(e.assessedOn)}</Table.Td>
                      <Table.Td>{siteName(e.siteId)}</Table.Td>
                      <Table.Td fw={600}>{e.area}</Table.Td>
                      <Table.Td>{found.length ? found.map(f => `${f.name}（${f.v}）`).join('、') : <Text span size="sm" c="dimmed">皆無</Text>}</Table.Td>
                      <Table.Td><LevelBadge level={e.level} /></Table.Td>
                      <Table.Td ta="right"><Button variant="default" size="xs" onClick={() => setViewing(e)}>檢視</Button></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{envs.data.length ? '沒有符合條件的評估。' : '還沒有作業環境危害評估。按「新增評估」記錄第一個作業區域。'}</CardNote>}
        </>
      )}
      <NewEnvModal opened={creating} onClose={() => setCreating(false)} />
      <EnvDetailModal env={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

function EnvDetailModal({ env, onClose }: { env: EnvAssessment | null; onClose: () => void }) {
  const siteName = useSiteName();
  const size = useModalSize('lg');
  const hazards = env?.hazards && typeof env.hazards === 'object' ? Object.entries(env.hazards as Record<string, { v?: string; note?: string }>) : [];
  return (
    <Modal opened={!!env} onClose={onClose} title="作業環境危害評估" {...size}>
      {env && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Kv label="評估日期" value={dt(env.assessedOn)} />
            <Kv label="廠區" value={siteName(env.siteId)} />
            <Kv label="評估區域" value={env.area} />
            <Kv label="管理分級" value={<LevelBadge level={env.level} />} />
          </SimpleGrid>
          <Table verticalSpacing={6}>
            <Table.Thead><Table.Tr><Table.Th>危害類別</Table.Th><Table.Th>判定</Table.Th><Table.Th>說明</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {hazards.map(([name, h]) => (
                <Table.Tr key={name}>
                  <Table.Td>{name}</Table.Td>
                  <Table.Td>{h?.v === '有' ? <ToneBadge tone="bad">有</ToneBadge> : h?.v === '可能有影響' ? <ToneBadge tone="warn">可能有影響</ToneBadge> : <Text span size="sm" c="dimmed">{h?.v ?? '—'}</Text>}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{h?.note || '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Modal>
  );
}

function NewEnvModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const size = useModalSize('lg');
  return (
    <Modal opened={opened} onClose={onClose} title="新增作業環境危害評估" {...size}>
      {opened && <NewEnvForm onDone={onClose} />}
    </Modal>
  );
}

function NewEnvForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const sites = useMySites();
  const today = todayIso();
  const [assessedOn, setAssessedOn] = useState(today);
  const [siteId, setSiteId] = useState<string | null>(sites[0]?.id ?? null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [area, setArea] = useState('');
  const [shiftType, setShiftType] = useState<string>(SHIFT_TYPES[0]);
  const [hazards, setHazards] = useState<Record<string, HazardDraft>>(emptyHazards);
  const [tried, setTried] = useState(false);
  const level = suggestedLevel(hazards);
  const problem = !assessedOn ? '請填寫評估日期。' : assessedOn > today ? '評估日期不能晚於今天。' : !siteId ? '請選擇廠區。' : !area.trim() ? '請填寫評估區域。' : null;
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/programs/maternal/env-assessments', {
      body: { siteId: siteId!, departmentId, area: area.trim(), shiftType, assessedOn, hazards: hazardsBody(hazards) },
    })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: envAssessmentsQuery.queryKey }); onDone(); },
  });
  const setHazard = (name: string, patch: Partial<HazardDraft>) => setHazards(h => ({ ...h, [name]: { ...h[name]!, ...patch } }));

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <DateField label="評估日期" required value={assessedOn} max={today} onChange={e => setAssessedOn(e.currentTarget.value)} />
        <Select label="廠區" required value={siteId} onChange={v => { setSiteId(v); setDepartmentId(null); }} data={sites.map(s => ({ value: s.id, label: s.name }))} allowDeselect={false} />
        <DepartmentSelect siteId={siteId} value={departmentId} onChange={setDepartmentId} />
        <TextInput label="評估區域" required placeholder="建物名稱、樓別" maxLength={100} value={area} onChange={e => setArea(e.currentTarget.value)}
          error={tried && !area.trim() ? '請填寫評估區域' : undefined} />
        <div>
          <Text size="sm" fw={500} mb={4}>作業型態</Text>
          <SegmentedControl fullWidth value={shiftType} onChange={setShiftType} data={[...SHIFT_TYPES]} aria-label="作業型態" />
        </div>
      </SimpleGrid>

      <div>
        <Text fw={600} mb="xs">危害辨識</Text>
        <Stack gap="xs">
          {MAT_HAZARDS.map(name => (
            <Box key={name} p="sm" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
              <Group justify="space-between" gap="xs" mb={6}>
                <Text size="sm" fw={600}>{name}</Text>
                <SegmentedControl size="xs" value={hazards[name]!.v} onChange={v => setHazard(name, { v: v as HazardAnswer })} data={[...HAZARD_ANSWERS]} aria-label={`${name}判定`} />
              </Group>
              <TextInput size="xs" placeholder="說明（選填）" maxLength={500} value={hazards[name]!.note} onChange={e => setHazard(name, { note: e.currentTarget.value })} aria-label={`${name}說明`} />
            </Box>
          ))}
        </Stack>
      </div>

      <Group gap="xs">
        <Text size="sm">依危害判定，管理分級為</Text><LevelBadge level={level} />
      </Group>
      <Text size="xs" c="dimmed">有危害 → 第三級；可能有影響 → 第二級；皆無 → 第一級。分級由系統依判定結果記錄。</Text>

      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {save.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(save.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setTried(true); if (!problem) save.mutate(); }}>儲存</Button>
      </Group>
    </Stack>
  );
}
