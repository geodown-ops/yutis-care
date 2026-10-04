import { createFileRoute } from '@tanstack/react-router';
import { CbiPage } from '../../CbiPage';

export const Route = createFileRoute('/_employee/tasks/cbi/$id')({
  component: function CbiTask() {
    const { id } = Route.useParams();
    return <CbiPage id={id} owner={Route.useRouteContext().me.id} />;
  },
});
