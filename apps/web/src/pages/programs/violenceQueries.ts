/* Reads and writes for 不法侵害預防. */
import { data } from '@yutis/api-client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import type { IncidentBody, IncidentPatch, Review, ReviewBody } from './violence';

export const riskAssessmentsQuery = queryOptions({
  queryKey: ['violence', 'risk-assessments'],
  queryFn: () => data(api.GET('/api/programs/violence/risk-assessments')),
});

export const checklistsQuery = queryOptions({
  queryKey: ['violence', 'checklists'],
  queryFn: () => data(api.GET('/api/programs/violence/checklists')),
});

/** Clinical staff only; details are decrypted and each read is audited, so the list is patched rather than read again. */
export const incidentsQuery = queryOptions({
  queryKey: ['violence', 'incidents'],
  queryFn: () => data(api.GET('/api/programs/violence/incidents')),
  refetchOnWindowFocus: false,
});

/** 措施查核及評估 of my sites, newest first. */
export const reviewsQuery = queryOptions({
  queryKey: ['violence', 'reviews'],
  queryFn: () => data(api.GET('/api/programs/violence/reviews')),
});

/** The tenant's sign-off roles (set by the tenant admin); a signer's role must be one of them. */
export const signOffRolesQuery = queryOptions({
  queryKey: ['sign-off-roles'],
  queryFn: () => data(api.GET('/api/service-records/sign-off-roles')),
  staleTime: 10 * 60_000,
});

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IncidentBody) => data(api.POST('/api/programs/violence/incidents', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: incidentsQuery.queryKey }),
  });
}

/** 結案, 重新開啟 or an edit: PATCH sends only what changed (incidentPatch); the answer replaces the cached row. */
export function useUpdateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: IncidentPatch }) =>
      data(api.PATCH('/api/programs/violence/incidents/{id}', { params: { path: { id } }, body })),
    onSuccess: row => qc.setQueryData(incidentsQuery.queryKey, list => list?.map(i => (i.id === row.id ? row : i))),
  });
}

function putReview(qc: ReturnType<typeof useQueryClient>, row: Review) {
  qc.setQueryData(reviewsQuery.queryKey, list => {
    if (!list) return list;
    const rest = list.filter(r => r.id !== row.id);
    return [row, ...rest].sort((a, b) => b.reviewedOn.localeCompare(a.reviewedOn));
  });
}

/** Save a draft: POST when new, PUT when it exists. */
export function useSaveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: ReviewBody }) => (id
      ? data(api.PUT('/api/programs/violence/reviews/{id}', { params: { path: { id } }, body }))
      : data(api.POST('/api/programs/violence/reviews', { body }))),
    onSuccess: row => putReview(qc, row),
  });
}

/** 送出簽核: one-time links come back once (emailed when the mail service sends); the review is read again for its new status. */
export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data(api.POST('/api/programs/violence/reviews/{id}/submit', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewsQuery.queryKey }),
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await data(api.DELETE('/api/programs/violence/reviews/{id}', { params: { path: { id } } })); return id; },
    onSuccess: id => qc.setQueryData(reviewsQuery.queryKey, list => list?.filter(r => r.id !== id)),
  });
}

/** 重寄: a new link for one signer; the old one stops working. */
export function useResendSignLink(reviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (signatureId: string) => data(api.POST('/api/programs/violence/reviews/{id}/signatures/{signatureId}/resend', { params: { path: { id: reviewId, signatureId } } })),
    onSuccess: (link) => {
      const now = new Date().toISOString();
      qc.setQueryData(reviewsQuery.queryKey, list => list?.map(r => (r.id !== reviewId ? r : {
        ...r, signatures: r.signatures.map(s => (s.id === link.signatureId ? { ...s, sentAt: now, firstSentAt: s.firstSentAt ?? now } : s)),
      })));
    },
  });
}
