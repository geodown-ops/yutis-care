/* Ergonomics reads and writes. The batch list itself is ergoDispatchesQuery in src/queries.ts (also used by the nurse home). */
import { useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { api } from '../../api';
import { ergoDispatchesQuery } from '../../queries';
import type { NmqBody, Survey } from './ergo';

/** One batch's surveys for the employees of my sites; every row read is audited, so it is not refetched on focus. */
export const ergoSurveysQuery = (dispatchId: string) => queryOptions({
  queryKey: ['ergo', 'surveys', dispatchId],
  queryFn: () => data(api.GET('/api/programs/ergo/dispatches/{id}/surveys', { params: { path: { id: dispatchId } } })),
  refetchOnWindowFocus: false,
});

export interface DispatchInput { name: string; sentOn: string; dueOn: string | null; employeeIds: string[] }

export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DispatchInput) => data(api.POST('/api/programs/ergo/dispatches', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ergoDispatchesQuery.queryKey }),
  });
}

/** 職護代填: scores the answers; a suspected hazard raises an 人因 event for case management. */
export function useFillNmq(dispatchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ surveyId, body }: { surveyId: string; body: NmqBody }) =>
      data(api.PUT('/api/programs/ergo/surveys/{id}', { params: { path: { id: surveyId } }, body })),
    onSuccess: (row: Survey) => {
      qc.setQueryData(ergoSurveysQuery(dispatchId).queryKey, list => list?.map(s => (s.id === row.id ? row : s)));
      void qc.invalidateQueries({ queryKey: ergoDispatchesQuery.queryKey });
      if (row.suspectedHazard) void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}
