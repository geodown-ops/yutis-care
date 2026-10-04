/*
 * Pure helpers shared by the programme lists: site and department filters, fill-in reminders and the CSV export the
 * prototype offers (built from the list on screen; the API has no export for these lists).
 */
import type { Schemas } from '@yutis/api-client';

export type OrgEntity = Schemas['DirectoryLegalEntityDto'];

/* ---------- site and department filters (by id; names only label the choices) ---------- */

export interface OrgFilter { siteId: string | null; departmentId: string | null }
export const NO_ORG_FILTER: OrgFilter = { siteId: null, departmentId: null };

/** Where a row belongs. Some lists carry only the site (risk assessments) or only the department (maternal cases). */
export interface OrgPlace { siteId?: string | null; departmentId?: string | null }
/** Labels for site and department ids. */
export interface OrgNames { site: (id: string) => string; department: (id: string) => string }
export interface Option { value: string; label: string }

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label, 'zh-Hant');

/**
 * Sites in the rows, and the departments of the chosen site (of every site when none is chosen). A department name
 * used in two sites is labelled with its site, so the two can be told apart.
 */
export function orgOptions(rows: readonly OrgPlace[], siteId: string | null, names: OrgNames): { sites: Option[]; departments: Option[] } {
  const sites = [...new Set(rows.flatMap(r => (r.siteId ? [r.siteId] : [])))].map(id => ({ value: id, label: names.site(id) }));
  const deps = new Map<string, string | null>();
  for (const r of rows) if (r.departmentId && (!siteId || r.siteId === siteId)) deps.set(r.departmentId, r.siteId ?? null);
  const named = [...deps].map(([id, site]) => ({ id, site, name: names.department(id) }));
  const twice = new Set(named.map(d => d.name).filter((n, i, all) => all.indexOf(n) !== i));
  return {
    sites: sites.sort(byLabel),
    departments: named.map(d => ({ value: d.id, label: twice.has(d.name) && d.site ? `${d.name}（${names.site(d.site)}）` : d.name })).sort(byLabel),
  };
}

export const matchOrg = (r: OrgPlace, f: OrgFilter) =>
  (!f.siteId || r.siteId === f.siteId) && (!f.departmentId || r.departmentId === f.departmentId);

/** Labels from the rows themselves, for lists that carry the names next to the ids. */
export function rowNames(rows: readonly { siteId: string; site: string; departmentId: string; department: string }[]): OrgNames {
  const sites = new Map(rows.map(r => [r.siteId, r.site]));
  const deps = new Map(rows.map(r => [r.departmentId, r.department]));
  return { site: id => sites.get(id) ?? '—', department: id => deps.get(id) ?? '—' };
}

/** Labels, and each department's site, from the organisation tree (GET /api/org). */
export function treeNames(org: readonly OrgEntity[]): OrgNames & { siteOf: (departmentId: string) => string | null } {
  const sites = org.flatMap(e => e.sites);
  const siteNames = new Map(sites.map(s => [s.id, s.name]));
  const deps = new Map(sites.flatMap(s => s.departments.map(d => [d.id, { name: d.name, siteId: s.id }] as const)));
  return {
    site: id => siteNames.get(id) ?? '—',
    department: id => deps.get(id)?.name ?? '—',
    siteOf: id => deps.get(id)?.siteId ?? null,
  };
}

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

/**
 * What to tell the nurse after sending reminders. RemindResultDto.emailed counts everyone with an email address; it
 * does not say whether the mail service really sent anything (it never does on the demo site), so neither does this.
 */
export function reminderText(reminded: number, unreachable: readonly string[]): string {
  const done = reminded ? `已催填 ${reminded} 位員工。` : '沒有可以寄提醒信的員工。';
  return unreachable.length ? `${done}${unreachable.join('、')} 沒有 Email，請另行通知。` : done;
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
