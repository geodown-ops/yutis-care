/* 附表八 reads and writes (GET/POST/PUT/DELETE /api/service-records, submit, resend), sign-off roles, staff, org names and phrases. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';
import type { ServiceRecordBody } from './records';

export const serviceRecordsQuery = queryOptions({ queryKey: ['service-records'], queryFn: () => data(api.GET('/api/service-records')) });

/** The tenant's sign-off roles; every signer's role must be one of them. */
export const signOffRolesQuery = queryOptions({
  queryKey: ['sign-off-roles'],
  queryFn: () => data(api.GET('/api/service-records/sign-off-roles')),
  staleTime: 10 * 60_000,
});

/** Every active back-office account with its work email (GET /api/staff), to fill in sign-off signers. */
export const signerStaffQuery = queryOptions({ queryKey: ['staff', 'all'], queryFn: () => data(api.GET('/api/staff')), staleTime: 5 * 60_000 });

/** Company → site → department names (GET /api/org), for the filters and 事業單位／部門名稱. */
export const orgQuery = queryOptions({ queryKey: ['org', 'directory'], queryFn: () => data(api.GET('/api/org')), staleTime: 10 * 60_000 });

/** Phrases for 臨場健康服務 and 處理狀況 (clinical staff only: the library is read with medical access). */
export const PHRASE_CATEGORIES = ['臨場健康服務', '處理狀況'] as const;
export const servicePhrasesQuery = queryOptions({
  queryKey: ['phrases', 'service'],
  queryFn: async () => (await data(api.GET('/api/phrases'))).filter(p => (PHRASE_CATEGORIES as readonly string[]).includes(p.category)),
  staleTime: 10 * 60_000,
});

export const createRecord = (body: ServiceRecordBody) => data(api.POST('/api/service-records', { body }));

export const updateRecord = (id: string, body: ServiceRecordBody) => data(api.PUT('/api/service-records/{id}', { params: { path: { id } }, body }));

/** Drafts only; a record sent for sign-off stays. */
export const deleteRecord = (id: string) => data(api.DELETE('/api/service-records/{id}', { params: { path: { id } } }));

/** Sends the draft for sign-off; the API emails each signer (`emailed` says whether it did), and the one-time links come back only in this response. */
export const submitRecord = (id: string) => data(api.POST('/api/service-records/{id}/submit', { params: { path: { id } } }));

export const resendSignature = (id: string, signatureId: string) =>
  data(api.POST('/api/service-records/{id}/signatures/{signatureId}/resend', { params: { path: { id, signatureId } } }));
