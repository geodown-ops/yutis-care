import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { EmployeeMasterPage } from '../../pages/admin/EmployeeMasterPage';
import { orgQuery } from '../../pages/admin/queries';

export const Route = createFileRoute('/_app/admin/employees')({
  beforeLoad: adminOnly,
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(orgQuery),
  component: EmployeeMasterPage,
});
