/* Pure helpers for the statistical reports (GET /api/reports…) and their exports (GET /api/exports). */
import type { Schemas } from '@yutis/api-client';

export type ReportType = Schemas['ReportTypeDto'];
export type ReportKind = ReportType['kind'];
export type Report = Schemas['ReportDto'];
export type Cell = Report['rows'][number][number];
export type ExportJob = Schemas['ExportDto'];

export const KIND_LABEL: Record<ReportKind, string> = { health: '健康管理', wl: '異常工作負荷', ergo: '人因性危害' };

export const isKind = (v: unknown): v is ReportKind => typeof v === 'string' && v in KIND_LABEL;

export interface KindGroup { kind: ReportKind; label: string; types: ReportType[] }

/** The catalogue grouped by kind, in the API's order. */
export function groupCatalogue(types: readonly ReportType[]): KindGroup[] {
  const groups: KindGroup[] = [];
  for (const t of types) {
    let g = groups.find(x => x.kind === t.kind);
    if (!g) groups.push(g = { kind: t.kind, label: KIND_LABEL[t.kind] ?? t.kind, types: [] });
    g.types.push(t);
  }
  return groups;
}

/** The report to show: the requested one if it exists, else the first of the kind, else the first overall. */
export function pickReport(groups: readonly KindGroup[], kind?: string, type?: string): ReportType | undefined {
  const g = groups.find(x => x.kind === kind) ?? groups[0];
  return g?.types.find(t => t.type === type) ?? g?.types[0];
}

/** Hidden (de-identified) cells come back as null. */
export const cellText = (v: Cell | undefined) => (v == null ? '—' : String(v));

export interface ChartSpec { data: Record<string, string | number | null>[]; series: { key: string; label: string }[] }

/**
 * Bars for the report's count columns: columns with no text (percentages are text; hidden cells are null). A total
 * repeated on every row (受檢人數, 總人數: the same value as in the summary) is not drawn; at most two series.
 * Null when there is nothing worth drawing (every count of the main measure hidden, or no rows).
 */
export function chartOf(report: Pick<Report, 'columns' | 'rows' | 'summary'>): ChartSpec | null {
  const { columns, rows, summary } = report;
  const totals = new Set(summary.map(s => s.value).filter(v => typeof v === 'number'));
  const isTotal = (c: number) => rows.length > 0 && rows.every(r => r[c] === rows[0]![c] && totals.has(r[c] as number));
  const keep = columns.map((_, c) => c)
    .filter(c => c > 0 && rows.every(r => r[c] == null || typeof r[c] === 'number') && !isTotal(c))
    .slice(0, 2);
  // The first count is the report's measure; when none of it is shown (or all zero) the rest (e.g. only 已發送) says little.
  const main = keep[0];
  if (main === undefined || !rows.some(r => typeof r[main] === 'number' && r[main] > 0)) return null;
  return {
    data: rows.map(r => Object.fromEntries([['label', String(r[0] ?? '')], ...keep.map((c, i) => [`s${i}`, r[c] ?? null])])),
    series: keep.map((c, i) => ({ key: `s${i}`, label: columns[c]! })),
  };
}

export type ExportState = 'queued' | 'running' | 'ready' | 'expired' | 'failed';

export const EXPORT_STATE_LABEL: Record<ExportState, string> = { queued: '排隊中', running: '產生中', ready: '可下載', expired: '已過期', failed: '失敗' };

export function exportState(e: Pick<ExportJob, 'status' | 'expiresAt'>, now: Date): ExportState {
  if (e.status !== 'done') return e.status;
  return e.expiresAt && new Date(e.expiresAt) > now ? 'ready' : 'expired';
}

/** The report an export is of; the API names it from the request, before the file exists. */
export const exportTitle = (e: Pick<ExportJob, 'title'>) => e.title || '統計報表';

/** The name to save a download under: the worker's file name, else the report's title with the format. */
export const exportFileName = (e: Pick<ExportJob, 'title' | 'fileName' | 'format'>) => e.fileName ?? `${exportTitle(e)}.${e.format}`;

export const isPending = (e: Pick<ExportJob, 'status'>) => e.status === 'queued' || e.status === 'running';

/** Minutes after which a queued export is worth a hint (the worker builds files in seconds). */
export const SLOW_MINUTES = 3;

export const waitedMinutes = (e: Pick<ExportJob, 'requestedAt'>, now: Date) => (now.getTime() - new Date(e.requestedAt).getTime()) / 60_000;

/** Poll while a recent export is still being built; stop after half an hour so a stuck queue is not polled forever. */
export function pollInterval(exports: readonly ExportJob[] | undefined, now: Date): number | false {
  return exports?.some(e => isPending(e) && waitedMinutes(e, now) < 30) ? 3000 : false;
}
