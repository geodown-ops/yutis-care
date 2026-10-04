/* Overwork reads and writes. The assessment list is workloadAssessmentsQuery in src/queries.ts (also used by the profile). */
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { api } from '../../api';
import { workloadAssessmentsQuery } from '../../queries';
import { markReminded } from './lists';
import type { Assessment, FatigueBody, Interview, InterviewBody, OverloadBody } from './workload';

/**
 * One assessment with the interview's guidance and notes (medical, so each read is audited). Read when the interview
 * form opens and never kept: closing the form drops it, and it is not refetched behind the user's back.
 */
export const assessmentDetailQuery = (id: string) => queryOptions({
  queryKey: ['workload-interview', id],
  queryFn: () => data(api.GET('/api/programs/workload/assessments/{id}', { params: { path: { id } } })),
  staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
});

/**
 * Put a saved assessment into the list. The list never carries the interview's guidance or notes (GET leaves them
 * out), so neither does the cached copy: what the page shows does not depend on whether the list was refetched since.
 */
function replace(qc: QueryClient, saved: Assessment) {
  const row = { ...saved, interview: saved.interview && { ...saved.interview, guidance: null, notes: null } };
  qc.setQueryData(workloadAssessmentsQuery.queryKey, list => list?.map(a => (a.id === row.id ? row : a)));
}

/** Change one interview in the cached list (a confirmation link sent, a notice sent) without reading the list again. */
export function patchInterview(qc: QueryClient, assessmentId: string, patch: (iv: Interview) => Interview) {
  qc.setQueryData(workloadAssessmentsQuery.queryKey, list => list?.map(a => (a.id === assessmentId && a.interview ? { ...a, interview: patch(a.interview) } : a)));
}

export function useCreateAssessments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employeeIds: string[]; sentOn: string }) => data(api.POST('/api/programs/workload/assessments', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: workloadAssessmentsQuery.queryKey }),
  });
}

/** 未填寫通知: email everyone in the list who still has a questionnaire open; the list counts the reminders. */
export function useRemindAssessments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assessmentIds: string[]) => data(api.POST('/api/programs/workload/assessments/remind', { body: { assessmentIds } })),
    onSuccess: (r, ids) => {
      qc.setQueryData(workloadAssessmentsQuery.queryKey, list => list && markReminded(list, new Set(ids), r.noEmail, new Date().toISOString()));
    },
  });
}

type Step =
  | { step: 'fatigue'; id: string; body: FatigueBody }
  | { step: 'overload'; id: string; body: OverloadBody }
  | { step: 'interview'; id: string; body: InterviewBody };

/** A saved step; an interview save also says whether it emailed the employee the date (InterviewSavedDto.emailed). */
export interface Saved { assessment: Assessment; emailed: boolean }

async function put(s: Step): Promise<Saved> {
  const params = { path: { id: s.id } };
  switch (s.step) {
    case 'fatigue': return { assessment: await data(api.PUT('/api/programs/workload/assessments/{id}/fatigue', { params, body: s.body })), emailed: false };
    case 'overload': return { assessment: await data(api.PUT('/api/programs/workload/assessments/{id}/overload', { params, body: s.body })), emailed: false };
    case 'interview': {
      const { emailed, ...assessment } = await data(api.PUT('/api/programs/workload/assessments/{id}/interview', { params, body: s.body }));
      return { assessment, emailed };
    }
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
    onSuccess: ({ assessment }, s) => {
      replace(qc, assessment);
      void qc.invalidateQueries({ queryKey: s.step === 'interview' ? ['work-advice'] : ['cases'] });
    },
  });
}

/** Assessment ids that could not be saved, and those whose employee was emailed the date. */
export interface Scheduled { saved: number; failed: string[]; emailed: string[] }

/** 安排面談 for several people at once: one PUT each, in turn. */
export function useScheduleInterviews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, body }: { ids: string[]; body: InterviewBody }): Promise<Scheduled> => {
      const failed: string[] = [];
      const emailed: string[] = [];
      for (const id of ids) {
        try {
          const saved = await put({ step: 'interview', id, body });
          replace(qc, saved.assessment);
          if (saved.emailed) emailed.push(id);
        } catch {
          failed.push(id);
        }
      }
      return { saved: ids.length - failed.length, failed, emailed };
    },
  });
}
