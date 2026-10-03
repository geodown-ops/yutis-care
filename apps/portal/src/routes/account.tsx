import { createFileRoute } from '@tanstack/react-router';
import { SimplePage } from '../SimplePage';

export const Route = createFileRoute('/account')({ component: () => <SimplePage titleKey="tabs.account" bodyKey="pages.account" /> });
