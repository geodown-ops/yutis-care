import { createFileRoute } from '@tanstack/react-router';
import { ViolencePage } from '../../pages/programs/ViolencePage';

export const Route = createFileRoute('/_app/programs/violence')({
  // The tab lives in the URL so it survives a reload and can be shared.
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s.tab === 'string' && s.tab ? { tab: s.tab } : {}),
  component: function Violence() {
    const { tab } = Route.useSearch();
    const navigate = Route.useNavigate();
    return <ViolencePage tab={tab} onTab={t => void navigate({ search: { tab: t }, replace: true })} />;
  },
});
