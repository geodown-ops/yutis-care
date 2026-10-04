/* Report catalogue, site-filtered reports and export jobs (GET /api/reports…, /api/exports…). */
import { ApiRequestError, data } from '@yutis/api-client';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../api';
import { reportQuery } from '../../queries';
import { saveFile } from '../nurse/files';
import type { ReportKind } from './report';

export const reportTypesQuery = queryOptions({ queryKey: ['reports'], queryFn: () => data(api.GET('/api/reports')), staleTime: Infinity });

/** One report for all my sites (the shared query the home page also uses), or narrowed to one site. */
export const siteReportQuery = (kind: ReportKind, type: string, siteId?: string) => (siteId
  ? queryOptions({
    queryKey: ['reports', kind, type, siteId],
    queryFn: () => data(api.GET('/api/reports/{kind}/{type}', { params: { path: { kind, type }, query: { siteId } } })),
  })
  : reportQuery(kind, type));

export const exportsQuery = queryOptions({ queryKey: ['exports'], queryFn: () => data(api.GET('/api/exports')) });

export const requestExport = (kind: ReportKind, type: string, format: 'xlsx' | 'pdf', siteId?: string) =>
  data(api.POST('/api/exports', { body: { report: kind, type, format, filters: siteId ? { siteId } : {} } }));

/**
 * Downloads a finished export through a single-use link that is valid for a few minutes. Fetched here rather than by
 * navigating, so an expired or used link shows as an error on the page instead of a raw error response.
 */
export async function downloadExport({ id, fileName }: { id: string; fileName: string }): Promise<void> {
  const { url } = await data(api.POST('/api/exports/{id}/link', { params: { path: { id } } }));
  const res = url ? await fetch(url, { credentials: 'same-origin' }) : null;
  if (!res?.ok) throw new ApiRequestError(res?.status ?? 410, 'link_expired', 'Download failed');
  saveFile(await res.blob(), fileName);
}
