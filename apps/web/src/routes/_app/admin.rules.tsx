import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { ruleSetsQuery } from '../../pages/admin/queries';
import { RulesPage, type RulesTab } from '../../pages/admin/RulesPage';

export const Route = createFileRoute('/_app/admin/rules')({
  beforeLoad: adminOnly,
  // The tab lives in the URL so the phrase library can be linked to directly.
  validateSearch: (s: Record<string, unknown>): { tab?: RulesTab } => (s.tab === 'phrases' ? { tab: 'phrases' } : {}),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(ruleSetsQuery),
  component: function Rules() {
    const { tab = 'grading' } = Route.useSearch();
    const navigate = Route.useNavigate();
    return <RulesPage tab={tab} onTab={t => void navigate({ search: t === 'phrases' ? { tab: t } : {}, replace: true })} />;
  },
});
