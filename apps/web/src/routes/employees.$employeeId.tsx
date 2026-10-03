import { createFileRoute } from '@tanstack/react-router';
import { CARE_ROLES } from '../nav';
import { EmployeeProfilePage } from '../pages/EmployeeProfilePage';
import { useMe } from '../session';

export const Route = createFileRoute('/employees/$employeeId')({
  component: function Profile() {
    const { employeeId } = Route.useParams();
    const me = useMe();
    return <EmployeeProfilePage id={employeeId} showHealth={CARE_ROLES.includes(me.role)} />;
  },
});
