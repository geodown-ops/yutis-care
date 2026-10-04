import { createFileRoute } from '@tanstack/react-router';
import { adminOnly } from '../../pages/admin/access';
import { ExamMappingPage } from '../../pages/admin/ExamMappingPage';
import { examMappingsQuery } from '../../pages/admin/queries';

export const Route = createFileRoute('/_app/admin/exam-mapping')({
  beforeLoad: adminOnly,
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(examMappingsQuery),
  component: ExamMappingPage,
});
