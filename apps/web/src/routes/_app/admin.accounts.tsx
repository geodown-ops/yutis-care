import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { AccountsPage } from '../../pages/admin/AccountsPage';
import { orgQuery, staffAccountsQuery } from '../../pages/admin/queries';

export const Route = createFileRoute('/_app/admin/accounts')({
  beforeLoad: adminOnly,
  loader: ({ context: { queryClient } }) => Promise.all([queryClient.ensureQueryData(staffAccountsQuery), queryClient.ensureQueryData(orgQuery)]),
  component: AccountsPage,
});
