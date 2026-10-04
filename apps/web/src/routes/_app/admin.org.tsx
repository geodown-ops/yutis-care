import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { OrgPage } from '../../pages/admin/OrgPage';
import { orgQuery } from '../../pages/admin/queries';

export const Route = createFileRoute('/_app/admin/org')({
  beforeLoad: adminOnly,
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(orgQuery),
  component: OrgPage,
});
