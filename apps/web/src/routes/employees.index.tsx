import { createFileRoute } from '@tanstack/react-router';
import { CARE_ROLES } from '../nav';
import { EmployeesPage } from '../pages/EmployeesPage';
import { useMe } from '../session';

export const Route = createFileRoute('/employees/')({
  // The search term lives in the URL so a filtered list can be shared and survives a reload.
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s.q === 'string' && s.q ? { q: s.q } : {}),
  component: function Employees() {
    const { q = '' } = Route.useSearch();
    const navigate = Route.useNavigate();
    const me = useMe();
    return <EmployeesPage showHealth={CARE_ROLES.includes(me.role)} q={q} onSearch={v => void navigate({ search: v ? { q: v } : {}, replace: true })} />;
  },
});
