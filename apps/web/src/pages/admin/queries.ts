/* Tenant admin (租戶管理) reads and uploads. Everything here needs the tenant-admin feature. */
import { data } from '@yutis/api-client';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '../../api';
import { auditParams, type AuditSearch } from './audit';
import { downloadFile } from './download';

export const orgQuery = queryOptions({ queryKey: ['admin', 'org'], queryFn: () => data(api.GET('/api/admin/org')) });

export const staffAccountsQuery = queryOptions({ queryKey: ['admin', 'users'], queryFn: () => data(api.GET('/api/admin/users')) });

export const examMappingsQuery = queryOptions({ queryKey: ['admin', 'exam-mappings'], queryFn: () => data(api.GET('/api/admin/exam-mappings')) });

export const ruleSetsQuery = queryOptions({ queryKey: ['admin', 'rule-sets'], queryFn: () => data(api.GET('/api/admin/rule-sets')) });

export const ruleSetQuery = (id: string) =>
  queryOptions({ queryKey: ['admin', 'rule-sets', id], queryFn: () => data(api.GET('/api/admin/rule-sets/{id}', { params: { path: { id } } })), staleTime: Infinity });

export const phrasesQuery = queryOptions({ queryKey: ['admin', 'phrases'], queryFn: () => data(api.GET('/api/admin/phrases')) });

export const signOffRolesQuery = queryOptions({ queryKey: ['admin', 'sign-off-roles'], queryFn: () => data(api.GET('/api/admin/sign-off-roles')) });

/**
 * One page of the audit log. Every search is itself written to the audit log, so this only runs when the admin searches
 * or turns the page: never again on window focus, reconnect or a remount with the same filters (hover preload runs no
 * query, as the route has no loader for it).
 */
export const auditQuery = (search: AuditSearch) => queryOptions({
  queryKey: ['admin', 'audit', search],
  queryFn: () => data(api.GET('/api/admin/audit', { params: { query: auditParams(search) } })),
  placeholderData: keepPreviousData,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

/**
 * Employees by name or 工號 (leavers too) for the audit filter: id, 工號 and name only. Every employee returned is itself
 * audited, so this runs only for typed text, and the same text is not searched again on focus or reconnect.
 */
export const adminEmployeesQuery = (q: string) => queryOptions({
  queryKey: ['admin', 'employees', q],
  queryFn: () => data(api.GET('/api/admin/employees', { params: { query: { q, limit: 20 } } })),
  enabled: q.length > 0,
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

/**
 * Employees by id (GET /api/admin/employees?ids=…): to name the employee of a shared audit link. Each one returned is
 * audited too, so the page asks only for an employee it cannot name otherwise, once.
 */
export const adminEmployeesByIdQuery = (ids: readonly string[]) => queryOptions({
  queryKey: ['admin', 'employees', { ids }],
  queryFn: () => data(api.GET('/api/admin/employees', { params: { query: { ids: ids.join(',') } } })),
  enabled: ids.length > 0,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

/** Blank import files with the header row the import reads (bold = required). */
export const downloadOrgTemplate = () => downloadFile(api.GET('/api/admin/org/import-template', { parseAs: 'blob' }), '組織架構匯入範本.xlsx');
export const downloadEmployeeTemplate = () => downloadFile(api.GET('/api/admin/employees/import-template', { parseAs: 'blob' }), '員工主檔匯入範本.xlsx');
/** A clinic's blank file with the column names of its mapping (bold = required), to hand to the clinic. */
export const downloadMappingTemplate = (m: { id: string; clinic: string }) =>
  downloadFile(api.GET('/api/admin/exam-mappings/{id}/template', { params: { path: { id: m.id } }, parseAs: 'blob' }), `${m.clinic}健檢匯入範本.xlsx`);

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Excel imports send the raw .xlsx as the body. The generated type says `string` (OpenAPI's binary), so the file is
 * passed through untouched instead of being JSON-encoded. Without `commit` the API only previews.
 */
const xlsx = (file: File, commit: boolean) => ({
  params: { query: { commit: commit ? 'true' as const : 'false' as const } },
  body: file as unknown as string,
  bodySerializer: (b: string) => b,
  headers: { 'Content-Type': XLSX_MIME },
});

export const importOrg = (file: File, commit: boolean) => data(api.POST('/api/admin/org/import', xlsx(file, commit)));

export const importEmployees = (file: File, commit: boolean) => data(api.POST('/api/admin/employees/import', xlsx(file, commit)));
