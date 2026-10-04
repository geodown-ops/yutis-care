import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '../../TasksPage';

export const Route = createFileRoute('/_employee/')({
  component: function Tasks() {
    const { me } = Route.useRouteContext();
    return <TasksPage name={me.name} accountLang={me.kind === 'employee' ? me.lang : undefined} />;
  },
});
