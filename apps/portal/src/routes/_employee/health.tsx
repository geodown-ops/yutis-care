import { createFileRoute } from '@tanstack/react-router';
import { HealthPage } from '../../HealthPage';

export const Route = createFileRoute('/_employee/health')({ component: HealthPage });
