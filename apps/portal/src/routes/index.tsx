import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '../TasksPage';

export const Route = createFileRoute('/')({ component: TasksPage });
