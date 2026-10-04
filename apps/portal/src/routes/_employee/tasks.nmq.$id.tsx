import { createFileRoute } from '@tanstack/react-router';
import { NmqPage } from '../../NmqPage';

export const Route = createFileRoute('/_employee/tasks/nmq/$id')({ component: () => <NmqPage id={Route.useParams().id} /> });
