import { createFileRoute } from '@tanstack/react-router';
import { CasesPage } from '../../pages/CasesPage';
import { casesQuery } from '../../queries';

export const Route = createFileRoute('/_app/cases')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(casesQuery),
  component: CasesPage,
});
