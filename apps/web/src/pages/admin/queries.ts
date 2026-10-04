/* Tenant admin (租戶管理) reads and uploads. Everything here needs the tenant-admin feature. */
import { data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';
import type { LegalEntity } from './org';

// The generated type lacks sites' address and departments (see org.ts).
export const orgQuery = queryOptions({ queryKey: ['admin', 'org'], queryFn: async () => (await data(api.GET('/api/admin/org'))) as unknown as LegalEntity[] });

export const staffAccountsQuery = queryOptions({ queryKey: ['admin', 'users'], queryFn: () => data(api.GET('/api/admin/users')) });

export const examMappingsQuery = queryOptions({ queryKey: ['admin', 'exam-mappings'], queryFn: () => data(api.GET('/api/admin/exam-mappings')) });

export const ruleSetsQuery = queryOptions({ queryKey: ['admin', 'rule-sets'], queryFn: () => data(api.GET('/api/admin/rule-sets')) });

export const ruleSetQuery = (id: string) =>
  queryOptions({ queryKey: ['admin', 'rule-sets', id], queryFn: () => data(api.GET('/api/admin/rule-sets/{id}', { params: { path: { id } } })), staleTime: Infinity });

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
