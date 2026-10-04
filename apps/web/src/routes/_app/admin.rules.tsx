import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { ruleSetsQuery } from '../../pages/admin/queries';
import { RULES_TABS, type RulesTab } from '../../pages/admin/rules';
import { RulesPage } from '../../pages/admin/RulesPage';

export const Route = createFileRoute('/_app/admin/rules')({
  beforeLoad: adminOnly,
  // The tab lives in the URL so the phrase library and sign-off roles can be linked to directly.
  validateSearch: (s: Record<string, unknown>): { tab?: RulesTab } =>
    (RULES_TABS.includes(s.tab as RulesTab) && s.tab !== 'grading' ? { tab: s.tab as RulesTab } : {}),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(ruleSetsQuery),
  component: function Rules() {
    const { tab = 'grading' } = Route.useSearch();
    const navigate = Route.useNavigate();
    return <RulesPage tab={tab} onTab={t => void navigate({ search: t === 'grading' ? {} : { tab: t }, replace: true })} />;
  },
});
