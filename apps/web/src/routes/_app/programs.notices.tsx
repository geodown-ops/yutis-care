import { createFileRoute } from '@tanstack/react-router';
import { NoticesPage } from '../../pages/advice/NoticesPage';
import { noticesQuery } from '../../pages/advice/queries';

export const Route = createFileRoute('/_app/programs/notices')({
  // Reading the inbox marks it read: fetch once per visit, not on hover-preload.
  loader: ({ context: { queryClient }, preload }) => (preload ? undefined : queryClient.fetchQuery(noticesQuery)),
  component: NoticesPage,
});
