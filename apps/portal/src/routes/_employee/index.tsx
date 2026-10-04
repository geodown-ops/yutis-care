import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '../../TasksPage';

export const Route = createFileRoute('/_employee/')({ component: () => <TasksPage name={Route.useRouteContext().me.name} /> });
