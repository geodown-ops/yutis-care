import { createFileRoute } from '@tanstack/react-router';
import { EmployeeProfilePage } from '../../pages/EmployeeProfilePage';
import { employeeQuery } from '../../queries';

export const Route = createFileRoute('/_app/employees/$employeeId')({
  loader: ({ context: { queryClient }, params }) => queryClient.ensureQueryData(employeeQuery(params.employeeId)),
  component: function Profile() {
    const { employeeId } = Route.useParams();
    return <EmployeeProfilePage id={employeeId} />;
  },
});
