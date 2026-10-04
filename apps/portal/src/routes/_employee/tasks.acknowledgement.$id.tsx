import { createFileRoute } from '@tanstack/react-router';
import { AcknowledgementPage } from '../../AcknowledgementPage';

export const Route = createFileRoute('/_employee/tasks/acknowledgement/$id')({ component: () => <AcknowledgementPage id={Route.useParams().id} /> });
