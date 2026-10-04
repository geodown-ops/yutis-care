import { createFileRoute } from '@tanstack/react-router';
import { NoProgrammeAccess } from '../../pages/programs/ErgoPage';
import { workloadView } from '../../pages/programs/workload';
import { WorkloadAdvicePage, WorkloadPage, type WorkloadTab } from '../../pages/programs/WorkloadPage';
import { workloadAssessmentsQuery } from '../../queries';
import { meQuery, useMe } from '../../session';

export interface WorkloadSearch { tab?: Exclude<WorkloadTab, 'assess'> }

export const Route = createFileRoute('/_app/programs/workload')({
  validateSearch: (s: Record<string, unknown>): WorkloadSearch => (s.tab === 'interview' || s.tab === 'log' ? { tab: s.tab } : {}),
  loader: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (me.kind === 'staff' && workloadView(me) === 'clinical') await queryClient.ensureQueryData(workloadAssessmentsQuery);
  },
  component: function Workload() {
    const me = useMe();
    const { tab = 'assess' } = Route.useSearch();
    const navigate = Route.useNavigate();
    switch (workloadView(me)) {
      case 'clinical':
        return <WorkloadPage tab={tab} onTab={t => void navigate({ search: t === 'assess' ? {} : { tab: t }, replace: true })} />;
      case 'advice':
        return <WorkloadAdvicePage />;
      default:
        return <NoProgrammeAccess title="異常工作負荷促發疾病預防">過勞評估與面談屬於健康資料，只有職護、職醫可以查看與處理；工作安排建議會提供給人資與部門主管。</NoProgrammeAccess>;
    }
  },
});
