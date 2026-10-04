import { createFileRoute } from '@tanstack/react-router';
import { ExamImportPage } from '../../pages/nurse/ExamImportPage';

export const Route = createFileRoute('/_app/exams/import')({ component: ExamImportPage });
