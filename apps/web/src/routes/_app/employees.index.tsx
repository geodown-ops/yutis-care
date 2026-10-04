import { createFileRoute } from '@tanstack/react-router';
import { EmployeesPage } from '../../pages/EmployeesPage';

export interface EmployeesSearch { q?: string; site?: string; page?: number }

export const Route = createFileRoute('/_app/employees/')({
  // Search, site and page live in the URL so a filtered list can be shared and survives a reload.
  validateSearch: (s: Record<string, unknown>): EmployeesSearch => ({
    ...(typeof s.q === 'string' && s.q ? { q: s.q } : {}),
    ...(typeof s.site === 'string' && s.site ? { site: s.site } : {}),
    ...(Number(s.page) > 1 ? { page: Math.floor(Number(s.page)) } : {}),
  }),
  component: function Employees() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return <EmployeesPage search={search} onSearch={next => void navigate({ search: next, replace: true })} />;
  },
});
