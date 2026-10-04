import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { CompanyPage } from '../../pages/admin/TenantPages';

export const Route = createFileRoute('/_app/admin/company')({ beforeLoad: adminOnly, component: CompanyPage });
