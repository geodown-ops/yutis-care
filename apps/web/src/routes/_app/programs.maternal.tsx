import { createFileRoute } from '@tanstack/react-router';
import { MaternalPage } from '../../pages/programs/MaternalPage';

export const Route = createFileRoute('/_app/programs/maternal')({
  // The tab lives in the URL so it survives a reload and can be shared.
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s.tab === 'string' && s.tab ? { tab: s.tab } : {}),
  component: function Maternal() {
    const { tab } = Route.useSearch();
    const navigate = Route.useNavigate();
    return <MaternalPage tab={tab} onTab={t => void navigate({ search: { tab: t }, replace: true })} />;
  },
});
