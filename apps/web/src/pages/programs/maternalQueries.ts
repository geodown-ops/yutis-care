/* Reads for 母性健康保護. Saves invalidate these keys; the work advice lives in src/queries.ts. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';

/** Workplace assessments of my sites (ENVIRONMENT_ROLES). */
export const envAssessmentsQuery = queryOptions({
  queryKey: ['maternal', 'env-assessments'],
  queryFn: () => data(api.GET('/api/programs/maternal/env-assessments')),
});

/** Pregnancy and postpartum notifications of my sites (clinical staff only; each listed person is audited). */
export const maternalCasesQuery = queryOptions({
  queryKey: ['maternal', 'cases'],
  queryFn: () => data(api.GET('/api/programs/maternal/cases')),
});
