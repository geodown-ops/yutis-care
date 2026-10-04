import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { EmployeeImportPage } from '../../pages/admin/EmployeeImportPage';

export const Route = createFileRoute('/_app/admin/employee-import')({ beforeLoad: adminOnly, component: EmployeeImportPage });
