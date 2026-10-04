/* 附表八 reads and writes (GET/POST/PUT /api/service-records, submit, resend) and the phrase library. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';
import type { ServiceRecordBody } from './records';

export const serviceRecordsQuery = queryOptions({ queryKey: ['service-records'], queryFn: () => data(api.GET('/api/service-records')) });

/** Phrases for 臨場健康服務 and 處理狀況 (clinical staff only: the library is read with medical access). */
export const PHRASE_CATEGORIES = ['臨場健康服務', '處理狀況'] as const;
export const servicePhrasesQuery = queryOptions({
  queryKey: ['phrases', 'service'],
  queryFn: async () => (await data(api.GET('/api/phrases'))).filter(p => (PHRASE_CATEGORIES as readonly string[]).includes(p.category)),
  staleTime: 10 * 60_000,
});

export const createRecord = (body: ServiceRecordBody) => data(api.POST('/api/service-records', { body }));

export const updateRecord = (id: string, body: ServiceRecordBody) => data(api.PUT('/api/service-records/{id}', { params: { path: { id } }, body }));

/** Sends the draft for sign-off; the one-time links come back only in this response. */
export const submitRecord = (id: string) => data(api.POST('/api/service-records/{id}/submit', { params: { path: { id } } }));

export const resendSignature = (id: string, signatureId: string) =>
  data(api.POST('/api/service-records/{id}/signatures/{signatureId}/resend', { params: { path: { id, signatureId } } }));
