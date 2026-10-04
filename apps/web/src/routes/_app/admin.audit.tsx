import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { validateAuditSearch } from '../../pages/admin/audit';
import { AuditPage } from '../../pages/admin/AuditPage';
import { staffAccountsQuery } from '../../pages/admin/queries';

export const Route = createFileRoute('/_app/admin/audit')({
  beforeLoad: adminOnly,
  // Filters and page live in the URL so a search can be shared and survives a reload. The audit log itself is only
  // read by the page (never by this loader), so hovering the menu item does not run an audited search.
  validateSearch: validateAuditSearch,
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(staffAccountsQuery),
  component: function Audit() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return <AuditPage search={search} onSearch={next => void navigate({ search: next })} />;
  },
});
