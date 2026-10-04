/* Reads for 不法侵害預防. Checklists and incidents are untyped on the wire and parsed in violence.ts. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';
import { parseChecklists, parseIncidents } from './violence';

export const riskAssessmentsQuery = queryOptions({
  queryKey: ['violence', 'risk-assessments'],
  queryFn: () => data(api.GET('/api/programs/violence/risk-assessments')),
});

export const checklistsQuery = queryOptions({
  queryKey: ['violence', 'checklists'],
  queryFn: async () => parseChecklists(await data(api.GET('/api/programs/violence/checklists'))),
});

/** Clinical staff only; details are decrypted and each read is audited. */
export const incidentsQuery = queryOptions({
  queryKey: ['violence', 'incidents'],
  queryFn: async () => parseIncidents(await data(api.GET('/api/programs/violence/incidents'))),
});
