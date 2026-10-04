import { createFileRoute } from '@tanstack/react-router';
import { CbiPage } from '../../CbiPage';

export const Route = createFileRoute('/_employee/tasks/cbi/$id')({ component: () => <CbiPage id={Route.useParams().id} /> });
