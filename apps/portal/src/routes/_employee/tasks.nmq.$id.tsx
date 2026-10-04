import { createFileRoute } from '@tanstack/react-router';
import { NmqPage } from '../../NmqPage';

export const Route = createFileRoute('/_employee/tasks/nmq/$id')({
  component: function NmqTask() {
    const { id } = Route.useParams();
    return <NmqPage id={id} owner={Route.useRouteContext().me.id} />;
  },
});
