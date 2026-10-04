/*
 * Pure helpers shared by the programme lists: site and department filters, fill-in reminders and the CSV export the
 * prototype offers (built from the list on screen; the API has no export for these lists).
 */
import type { Schemas } from '@yutis/api-client';

export type OrgEntity = Schemas['DirectoryLegalEntityDto'];

/* ---------- site and department filters (rows carry the names, as the API returns them) ---------- */

export interface OrgFilter { site: string | null; department: string | null }
export const NO_ORG_FILTER: OrgFilter = { site: null, department: null };

const zh = (a: string, b: string) => a.localeCompare(b, 'zh-Hant');

/** Sites in the rows, and the departments of the chosen site (of every site when none is chosen). */
export function orgOptions(rows: readonly { site: string; department: string }[], site: string | null) {
  return {
    sites: [...new Set(rows.map(r => r.site))].sort(zh),
    departments: [...new Set(rows.filter(r => !site || r.site === site).map(r => r.department))].sort(zh),
  };
}

export const matchOrg = (r: { site: string; department: string }, f: OrgFilter) =>
  (!f.site || r.site === f.site) && (!f.department || r.department === f.department);

/** Departments of one site from GET /api/org, for pickers. */
export function siteDepartments(org: readonly OrgEntity[], siteId: string | null | undefined) {
  return org.flatMap(e => e.sites).find(s => s.id === siteId)?.departments ?? [];
}

/* ---------- fill-in reminders ---------- */

interface Remindable { id: string; employeeId: string; reminders: number; lastRemindedAt: string | null }

/**
 * The list after POST …/remind: everyone asked about who has an email got one more reminder. The API answers with
 * a count and the employees it could not reach, so the rows are updated here instead of reading (and auditing) the
 * whole list again.
 */
export function markReminded<T extends Remindable>(list: readonly T[], asked: ReadonlySet<string>, noEmail: readonly string[], at: string): T[] {
  const unreachable = new Set(noEmail);
  return list.map(r => (asked.has(r.id) && !unreachable.has(r.employeeId) ? { ...r, reminders: r.reminders + 1, lastRemindedAt: at } : r));
}

/** What to tell the nurse after sending reminders. */
export function reminderText(emailed: number, unreachable: readonly string[]): string {
  const sent = emailed ? `已寄出 ${emailed} 封催填通知。` : '沒有寄出催填通知。';
  return unreachable.length ? `${sent}${unreachable.join('、')} 沒有 Email，請另行通知。` : sent;
}

/* ---------- CSV export ---------- */

export type Cell = string | number | null | undefined;
export interface Column<T> { h: string; v: (row: T) => Cell }

/** One CSV field. Text that a spreadsheet would run as a formula gets a leading apostrophe. */
export function csvCell(v: Cell): string {
  if (v == null) return '';
  const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function csvText<T>(cols: readonly Column<T>[], rows: readonly T[]): string {
  return [cols.map(c => csvCell(c.h)), ...rows.map(r => cols.map(c => csvCell(c.v(r))))].map(l => l.join(',')).join('\r\n');
}

/** Saves the rows as a CSV file. The byte-order mark makes Excel read it as UTF-8. */
export function downloadCsv<T>(fileName: string, cols: readonly Column<T>[], rows: readonly T[]): void {
  const href = URL.createObjectURL(new Blob(['﻿', csvText(cols, rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
