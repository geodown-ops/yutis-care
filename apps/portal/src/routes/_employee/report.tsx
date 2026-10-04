import { createFileRoute } from '@tanstack/react-router';
import { SimplePage } from '../../SimplePage';

/** The API has no employee self-report yet, so this tab only says whom to contact. */
export const Route = createFileRoute('/_employee/report')({ component: () => <SimplePage titleKey="tabs.report" bodyKey="pages.report" /> });
