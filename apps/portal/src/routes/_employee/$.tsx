import { createFileRoute } from '@tanstack/react-router';
import { SimplePage } from '../../SimplePage';

export const Route = createFileRoute('/_employee/$')({ component: () => <SimplePage titleKey="tabs.tasks" bodyKey="pages.notFound" /> });
