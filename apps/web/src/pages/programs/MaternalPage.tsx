import { Card, Group, Progress, SimpleGrid, Skeleton, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { MAT_LEVELS } from '@yutis/domain';
import { StatCard } from '@yutis/ui';
import { canAccess } from '../../nav';
import { workAdviceQuery } from '../../queries';
import { useMe } from '../../session';
import { adviceByDate, type WorkAdvice } from '../advice/advice';
import { CardNote, problemText } from '../states';
import { caseAckState, countByLevel, isPostpartum, latestInterview, LEVEL_TONE, typeLabel, type EnvAssessment, type MaternalCase } from './maternal';
import { CaseAckBadge, MaternalCasesTab } from './maternalCases';
import { LevelBadge, MaternalEnvTab } from './maternalEnv';
import { envAssessmentsQuery, maternalCasesQuery } from './maternalQueries';
import { ADVICE_ACCESS, CLINICAL_ACCESS, dt, ENVIRONMENT_ACCESS, PersonLink } from './maternalViolenceCommon';

type MaternalTab = 'env' | 'cases' | 'log' | 'advice';
const NOWRAP = { whiteSpace: 'nowrap' } as const;

/**
 * 工作場所母性健康保護. Clinical staff run the whole programme; 職安衛人員 assess workplaces; 人資 sees the
 * work-arrangement advice that comes out of interviews, never the notification or interview itself.
 */
export function MaternalPage({ tab, onTab }: { tab?: string; onTab: (tab: MaternalTab) => void }) {
  const me = useMe();
  const clinical = canAccess(me, CLINICAL_ACCESS);
  const environment = canAccess(me, ENVIRONMENT_ACCESS);
  const advises = canAccess(me, ADVICE_ACCESS);
  const tabs = ([
    environment && { value: 'env', label: '環境危害辨識' },
    clinical && { value: 'cases', label: '個人評估' },
    clinical && { value: 'log', label: '執行紀錄表' },
    !clinical && advises && { value: 'advice', label: '工作安排建議' },
  ] as const).filter(t => !!t);
  const current = tabs.find(t => t.value === tab)?.value ?? (clinical ? 'cases' : tabs[0]?.value);

  const envs = useQuery({ ...envAssessmentsQuery, enabled: environment });
  const cases = useQuery({ ...maternalCasesQuery, enabled: clinical });
  const advice = useQuery({ ...workAdviceQuery, enabled: !clinical && advises });

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>母性健康保護</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {clinical ? '作業環境危害辨識與分級，妊娠及產後一年內員工的通報、面談與工作適性安排。'
            : environment ? '辨識作業場所對妊娠及產後員工的危害，並依結果分級管理。'
            : '妊娠及產後一年內員工面談後的工作安排建議，請據以調整工作。'}
        </Text>
      </div>

      {!current ? <Card><CardNote>你的角色沒有這個計畫的權限。</CardNote></Card> : (
        <>
          {clinical ? <ClinicalOverview cases={cases} envs={envs} /> : environment && <LevelOverview envs={envs} />}
          {tabs.length > 1 && (
            <Tabs value={current} onChange={v => v && onTab(v as MaternalTab)}>
              <Tabs.List>{tabs.map(t => <Tabs.Tab key={t.value} value={t.value}>{t.label}</Tabs.Tab>)}</Tabs.List>
            </Tabs>
          )}
          {current === 'env' && <MaternalEnvTab envs={envs} />}
          {current === 'cases' && <MaternalCasesTab cases={cases} envs={envs.data ?? []} />}
          {current === 'log' && <LogTab cases={cases} envs={envs} />}
          {current === 'advice' && <AdviceTab advice={advice} />}
        </>
      )}
    </Stack>
  );
}

function ClinicalOverview({ cases, envs }: { cases: UseQueryResult<MaternalCase[]>; envs: UseQueryResult<EnvAssessment[]> }) {
  const list = cases.data ?? [];
  const pending = list.filter(c => !c.interviews.length).length;
  const waiting = list.filter(c => caseAckState(c) === 'sent').length;
  const levels = envs.data && countByLevel(envs.data);
  return (
    <Card>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard tone="pink" label="妊娠通報" value={cases.data ? list.filter(c => !isPostpartum(c.type)).length : '—'} />
        <StatCard tone="blue" label="產後一年內通報" value={cases.data ? list.filter(c => isPostpartum(c.type)).length : '—'} />
        <StatCard tone="lavender" label="已面談" value={cases.data ? list.length - pending : '—'}
          note={cases.data && (pending || waiting) ? [pending && `${pending} 位未面談`, waiting && `${waiting} 位待確認`].filter(Boolean).join('，') : undefined} />
        <StatCard tone="mint" label="已評估作業區域" value={envs.data ? envs.data.length : '—'} note={levels?.['第三級管理'] ? `第三級 ${levels['第三級管理']} 區` : undefined} />
      </SimpleGrid>
    </Card>
  );
}

function LevelOverview({ envs }: { envs: UseQueryResult<EnvAssessment[]> }) {
  const levels = envs.data && countByLevel(envs.data);
  return (
    <Card>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatCard tone="lavender" label="已評估作業區域" value={envs.data ? envs.data.length : '—'} />
        <StatCard tone="mint" label="第一級管理" value={levels ? levels['第一級管理'] : '—'} />
        <StatCard tone="blue" label="第二級管理" value={levels ? levels['第二級管理'] : '—'} />
        <StatCard tone="pink" label="第三級管理" value={levels ? levels['第三級管理'] : '—'} />
      </SimpleGrid>
    </Card>
  );
}

/** 執行紀錄表: how the workplaces are graded and what each notified employee was advised and agreed to. */
function LogTab({ cases, envs }: { cases: UseQueryResult<MaternalCase[]>; envs: UseQueryResult<EnvAssessment[]> }) {
  const levels = envs.data && countByLevel(envs.data);
  const total = envs.data?.length ?? 0;
  return (
    <Stack gap="md">
      <Card>
        <Text fw={600} size="lg" mb="md">作業區域管理分級</Text>
        {envs.isPending ? <Skeleton h={100} /> : envs.isError ? <CardNote>{problemText(envs.error)}</CardNote> : total === 0 ? <CardNote>還沒有作業環境危害評估。</CardNote> : (
          <Stack gap="md">
            {MAT_LEVELS.map(l => (
              <div key={l}>
                <Group justify="space-between" mb={6}><LevelBadge level={l} /><Text size="sm" fw={600}>{levels![l]}<Text span size="xs" c="dimmed"> / {total} 區</Text></Text></Group>
                <Progress value={(levels![l] / total) * 100} size="sm" color={`var(--yutis-${LEVEL_TONE[l]})`} aria-label={`${l} ${levels![l]} 區`} />
              </div>
            ))}
          </Stack>
        )}
      </Card>
      <Card>
        <Text fw={600} size="lg" mb="sm">通報與工作適性安排</Text>
        {cases.isPending ? <Skeleton h={160} /> : cases.isError ? <CardNote>{problemText(cases.error)}</CardNote> : (
          <>
            <Table.ScrollContainer minWidth={1000}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>員工</Table.Th><Table.Th>通報</Table.Th><Table.Th>環境分級</Table.Th><Table.Th>最近面談</Table.Th><Table.Th>工作適性建議</Table.Th>
                    <Table.Th>條件限制</Table.Th><Table.Th>建議員工接受之事項</Table.Th><Table.Th>員工確認</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {cases.data.map(c => {
                    const last = latestInterview(c);
                    return (
                      <Table.Tr key={c.id}>
                        <Table.Td style={NOWRAP}><PersonLink employeeId={c.employeeId} name={c.name} /></Table.Td>
                        <Table.Td style={NOWRAP}>{typeLabel(c.type)} · {dt(c.notifiedOn)}</Table.Td>
                        <Table.Td style={NOWRAP}><LevelBadge level={c.level} /></Table.Td>
                        <Table.Td style={NOWRAP}>{last ? dt(last.interviewedOn) : <Text span size="sm" c="dimmed">未面談</Text>}</Table.Td>
                        <Table.Td>{last?.fitAdvice || '—'}</Table.Td>
                        <Table.Td>{last?.limits.join('、') || '—'}</Table.Td>
                        <Table.Td>{last?.agreedArrangement || '—'}</Table.Td>
                        <Table.Td style={NOWRAP}><CaseAckBadge c={c} /></Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {cases.data.length === 0 && <CardNote>還沒有妊娠或產後通報。</CardNote>}
          </>
        )}
      </Card>
    </Stack>
  );
}

/** 人資: the work-arrangement advice from maternal interviews, without the notification or interview behind it. */
function AdviceTab({ advice }: { advice: UseQueryResult<WorkAdvice[]> }) {
  const rows = (advice.data ?? []).filter(a => a.programme === '母性健康保護').sort(adviceByDate);
  return (
    <Card>
      <Text size="sm" c="dimmed" mb="sm">職護、職醫面談後的工作安排建議。妊娠狀況與面談內容只有醫護人員看得到。</Text>
      {advice.isPending ? <Skeleton h={160} /> : advice.isError ? <CardNote>{problemText(advice.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th>員工</Table.Th><Table.Th>面談日期</Table.Th><Table.Th>工作安排建議</Table.Th><Table.Th>工作限制</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((a, i) => (
                  <Table.Tr key={`${a.employeeId}-${a.on}-${i}`}>
                    <Table.Td style={NOWRAP}><PersonLink employeeId={a.employeeId} name={a.name} empNo={a.empNo} /></Table.Td>
                    <Table.Td style={NOWRAP}>{dt(a.on)}</Table.Td>
                    <Table.Td>{a.advice || '—'}</Table.Td>
                    <Table.Td>{a.restrictions.join('、') || '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>目前沒有母性健康保護的工作安排建議。</CardNote>}
        </>
      )}
    </Card>
  );
}
