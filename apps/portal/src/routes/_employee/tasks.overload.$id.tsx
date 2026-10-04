import { createFileRoute } from '@tanstack/react-router';
import { OverloadPage } from '../../OverloadPage';

export const Route = createFileRoute('/_employee/tasks/overload/$id')({ component: () => <OverloadPage id={Route.useParams().id} /> });
