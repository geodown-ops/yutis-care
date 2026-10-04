/* Read queries shared by the back-office pages. Shapes come from the generated API types. */
import { data } from '@yutis/api-client';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from './api';

/** Employees with abnormal events in my sites, with their case (health data: care staff only). */
export const casesQuery = queryOptions({ queryKey: ['cases'], queryFn: () => data(api.GET('/api/cases')) });

/** My assistance records with a follow-up date that is not done yet. */
export const followUpsQuery = queryOptions({ queryKey: ['records', 'follow-ups'], queryFn: () => data(api.GET('/api/records/follow-ups')) });

export const ergoDispatchesQuery = queryOptions({ queryKey: ['ergo', 'dispatches'], queryFn: () => data(api.GET('/api/programs/ergo/dispatches')) });

export const workloadAssessmentsQuery = queryOptions({ queryKey: ['workload', 'assessments'], queryFn: () => data(api.GET('/api/programs/workload/assessments')) });

export const reportQuery = (kind: 'health' | 'wl' | 'ergo', type: string) =>
  queryOptions({ queryKey: ['reports', kind, type], queryFn: () => data(api.GET('/api/reports/{kind}/{type}', { params: { path: { kind, type } } })) });

export interface EmployeeSearch { q?: string; siteId?: string; page?: number }
export const EMPLOYEES_PAGE_SIZE = 50;

export const employeesQuery = ({ q, siteId, page = 1 }: EmployeeSearch) => queryOptions({
  queryKey: ['employees', { q, siteId, page }],
  queryFn: () => data(api.GET('/api/employees', { params: { query: { q, siteId, limit: EMPLOYEES_PAGE_SIZE, offset: (page - 1) * EMPLOYEES_PAGE_SIZE } } })),
  placeholderData: keepPreviousData,
});

export const employeeQuery = (id: string) =>
  queryOptions({ queryKey: ['employees', id], queryFn: () => data(api.GET('/api/employees/{id}', { params: { path: { id } } })) });

export const employeeExamsQuery = (employeeId: string) =>
  queryOptions({ queryKey: ['employees', employeeId, 'exams'], queryFn: () => data(api.GET('/api/employees/{employeeId}/exams', { params: { path: { employeeId } } })) });

export const employeeRecordsQuery = (employeeId: string) =>
  queryOptions({ queryKey: ['employees', employeeId, 'records'], queryFn: () => data(api.GET('/api/employees/{employeeId}/records', { params: { path: { employeeId } } })) });

export const employeeCaseQuery = (employeeId: string) =>
  queryOptions({ queryKey: ['employees', employeeId, 'case'], queryFn: () => data(api.GET('/api/employees/{employeeId}/case', { params: { path: { employeeId } } })) });

export const workAdviceQuery = queryOptions({ queryKey: ['work-advice'], queryFn: () => data(api.GET('/api/programs/work-advice')) });
