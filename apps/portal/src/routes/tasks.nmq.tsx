import { createFileRoute } from '@tanstack/react-router';
import { NmqPage } from '../NmqPage';

export const Route = createFileRoute('/tasks/nmq')({ component: NmqPage });
