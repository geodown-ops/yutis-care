import { createFileRoute } from '@tanstack/react-router';
import { NoticesPage } from '../../pages/advice/NoticesPage';
import { noticesQuery, unreadNoticesQuery } from '../../pages/advice/queries';

export const Route = createFileRoute('/_app/programs/notices')({
  // Reading the inbox marks it read: fetch once per visit, not on hover-preload. The menu badge then recounts.
  loader: async ({ context: { queryClient }, preload }) => {
    if (preload) return;
    await queryClient.fetchQuery(noticesQuery);
    void queryClient.invalidateQueries({ queryKey: unreadNoticesQuery.queryKey });
  },
  component: NoticesPage,
});
