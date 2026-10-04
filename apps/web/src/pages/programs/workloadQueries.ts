/* Overwork reads and writes. The assessment list is workloadAssessmentsQuery in src/queries.ts (also used by the profile). */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { api } from '../../api';
import { workloadAssessmentsQuery } from '../../queries';
import type { Assessment, FatigueBody, InterviewBody, OverloadBody } from './workload';

/**
 * Put a saved assessment into the list. The list never carries interview notes (GET blanks them), so neither does the
 * cached copy: what the page shows does not depend on whether the list was refetched since.
 */
function replace(qc: QueryClient, saved: Assessment) {
  const row = { ...saved, interview: saved.interview && { ...saved.interview, notes: null } };
  qc.setQueryData(workloadAssessmentsQuery.queryKey, list => list?.map(a => (a.id === row.id ? row : a)));
}

export function useCreateAssessments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employeeIds: string[]; sentOn: string }) => data(api.POST('/api/programs/workload/assessments', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: workloadAssessmentsQuery.queryKey }),
  });
}

type Step =
  | { step: 'fatigue'; id: string; body: FatigueBody }
  | { step: 'overload'; id: string; body: OverloadBody }
  | { step: 'interview'; id: string; body: InterviewBody };

function put(s: Step): Promise<Assessment> {
  const params = { path: { id: s.id } };
  switch (s.step) {
    case 'fatigue': return data(api.PUT('/api/programs/workload/assessments/{id}/fatigue', { params, body: s.body }));
    case 'overload': return data(api.PUT('/api/programs/workload/assessments/{id}/overload', { params, body: s.body }));
    case 'interview': return data(api.PUT('/api/programs/workload/assessments/{id}/interview', { params, body: s.body }));
  }
}

/**
 * The three steps: questionnaire answers re-run the risk matrix (an elevated result raises an event for case
 * management); the interview's advice is what HR sees.
 */
export function useSaveStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: put,
    onSuccess: (saved, s) => {
      replace(qc, saved);
      void qc.invalidateQueries({ queryKey: s.step === 'interview' ? ['work-advice'] : ['cases'] });
    },
  });
}

/** 安排面談 for several people at once: one PUT each, in turn; reports who could not be saved. */
export function useScheduleInterviews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, body }: { ids: string[]; body: InterviewBody }) => {
      const failed: string[] = [];
      for (const id of ids) {
        try {
          replace(qc, await put({ step: 'interview', id, body }));
        } catch {
          failed.push(id);
        }
      }
      return { saved: ids.length - failed.length, failed };
    },
  });
}
