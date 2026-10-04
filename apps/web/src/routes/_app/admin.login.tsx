import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { LoginSettingsPage } from '../../pages/admin/TenantPages';

export const Route = createFileRoute('/_app/admin/login')({ beforeLoad: adminOnly, component: LoginSettingsPage });
