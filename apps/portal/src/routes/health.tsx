import { createFileRoute } from '@tanstack/react-router';
import { SimplePage } from '../SimplePage';

export const Route = createFileRoute('/health')({ component: () => <SimplePage titleKey="tabs.health" bodyKey="pages.health" /> });
