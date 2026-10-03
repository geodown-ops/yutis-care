import { createFileRoute } from '@tanstack/react-router';
import { SimplePage } from '../SimplePage';

export const Route = createFileRoute('/report')({ component: () => <SimplePage titleKey="tabs.report" bodyKey="pages.report" /> });
