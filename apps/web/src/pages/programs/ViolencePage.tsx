import { Alert, Card, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@yutis/ui';
import { useState } from 'react';
import { canAccess } from '../../nav';
import { useMe } from '../../session';
import { CardNote } from '../states';
import { CLINICAL_ACCESS, dt, ENVIRONMENT_ACCESS } from './maternalViolenceCommon';
import { countByRisk, riskRows } from './violence';
import { ViolenceChecklistTab } from './violenceChecklists';
import { ViolenceIncidentsTab } from './violenceIncidents';
import { checklistsQuery, incidentsQuery, reviewsQuery, riskAssessmentsQuery } from './violenceQueries';
import { ViolenceReviewsTab } from './violenceReviews';
import { ViolenceRiskTab } from './violenceRisk';

type ViolenceTab = 'risk' | 'place' | 'staffing' | 'incidents' | 'review';

/**
 * 執行職務遭受不法侵害預防. Risk assessments, checklists and reviews describe workplaces (with 職安衛人員); incidents
 * are about people and stay with the clinical staff.
 */
export function ViolencePage({ tab, onTab }: { tab?: string; onTab: (tab: ViolenceTab) => void }) {
  const me = useMe();
  const clinical = canAccess(me, CLINICAL_ACCESS);
  const environment = canAccess(me, ENVIRONMENT_ACCESS);
  const [notice, setNotice] = useState<string | null>(null);
  const tabs = ([
    environment && { value: 'risk', label: '辨識及評估危害' },
    environment && { value: 'place', label: '適當配置作業場所' },
    environment && { value: 'staffing', label: '依工作適性調整人力' },
    clinical && { value: 'incidents', label: '事件通報與處理' },
    environment && { value: 'review', label: '措施查核及評估' },
  ] as const).filter(t => !!t);
  const current = tabs.find(t => t.value === tab)?.value ?? tabs[0]?.value;

  const risks = useQuery({ ...riskAssessmentsQuery, enabled: environment });
  const checklists = useQuery({ ...checklistsQuery, enabled: environment });
  const incidents = useQuery({ ...incidentsQuery, enabled: clinical });
  const reviews = useQuery({ ...reviewsQuery, enabled: environment && current === 'review' });
  const high = risks.data ? countByRisk(risks.data.flatMap(r => riskRows(r.items)))['高度風險'] : undefined;
  const toFix = checklists.data?.reduce((n, c) => n + c.items.filter(i => !i.ok).length, 0);
  const open = incidents.data?.filter(i => i.status !== '結案').length;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>不法侵害預防</Title>
        <Text c="dimmed" size="sm" mt={4}>辨識及評估危害、適當配置作業場所、依工作適性調整人力{clinical ? '、事件通報與處理' : ''}，以及措施查核及評估。</Text>
      </div>
      {notice && <Alert color="green" variant="light" withCloseButton onClose={() => setNotice(null)} closeButtonLabel="關閉">{notice}</Alert>}
      {!current ? <Card><CardNote>你的角色沒有這個計畫的權限。</CardNote></Card> : (
        <>
          <Card>
            <SimpleGrid cols={{ base: 2, md: clinical ? 4 : 3 }} spacing="sm">
              <StatCard tone="lavender" label="風險評估" value={risks.data?.length ?? '—'} note={risks.data?.[0] ? `最近 ${dt(risks.data[0].assessedOn)}` : undefined} />
              <StatCard tone="pink" label="高度風險項目" value={high ?? '—'} note="所有評估合計" />
              <StatCard tone="blue" label="需改善檢點項目" value={toFix ?? '—'} note={checklists.data ? `${checklists.data.length} 份檢點表` : undefined} />
              {clinical && <StatCard tone="mint" label="處理中事件" value={open ?? '—'} note={incidents.data ? `共 ${incidents.data.length} 件` : undefined} />}
            </SimpleGrid>
          </Card>
          {tabs.length > 1 && (
            <Tabs value={current} onChange={v => v && onTab(v as ViolenceTab)}>
              <Tabs.List>{tabs.map(t => <Tabs.Tab key={t.value} value={t.value}>{t.label}</Tabs.Tab>)}</Tabs.List>
            </Tabs>
          )}
          {current === 'risk' && <ViolenceRiskTab risks={risks} />}
          {current === 'place' && <ViolenceChecklistTab kind="作業場所" checklists={checklists} />}
          {current === 'staffing' && <ViolenceChecklistTab kind="人力" checklists={checklists} />}
          {current === 'incidents' && <ViolenceIncidentsTab incidents={incidents} onNotice={setNotice} />}
          {current === 'review' && <ViolenceReviewsTab reviews={reviews} onNotice={setNotice} />}
        </>
      )}
    </Stack>
  );
}
