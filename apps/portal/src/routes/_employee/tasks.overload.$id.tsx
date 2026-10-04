import { createFileRoute } from '@tanstack/react-router';
import { OverloadPage } from '../../OverloadPage';

export const Route = createFileRoute('/_employee/tasks/overload/$id')({
  component: function OverloadTask() {
    const { id } = Route.useParams();
    return <OverloadPage id={id} owner={Route.useRouteContext().me.id} />;
  },
});
