/*
 * The two overwork questionnaires (異常工作負荷促發疾病預防): the Copenhagen Burnout Inventory, Taiwan workplace
 * version, and working hours with work patterns. Wording comes from the prototype (prototype/data.js CBI and
 * WORK_PATTERNS); scoring stays in @yutis/domain and the API.
 */
import type { TenantPaths } from '@yutis/api-client';
import { CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, WORK_PATTERNS } from '@yutis/domain';
import { isRecord, type DraftFormat } from './drafts';

type JsonBody<P extends keyof TenantPaths> = TenantPaths[P]['put'] extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;
export type CbiBody = JsonBody<'/api/portal/workload/{id}/cbi'>;
export type OverloadBody = JsonBody<'/api/portal/workload/{id}/overload'>;
export type WorkPattern = OverloadBody['workPatterns'][number];

/** Personal items are answered by frequency; the first three work items by degree, the rest by frequency. */
export type CbiScale = 'freq' | 'degree';
export interface CbiStep { part: 'p' | 'w'; index: number; scale: CbiScale }

export const CBI_STEPS: readonly CbiStep[] = [
  ...Array.from({ length: CBI_PERSONAL_ITEMS }, (_, index): CbiStep => ({ part: 'p', index, scale: 'freq' })),
  ...Array.from({ length: CBI_WORK_ITEMS }, (_, index): CbiStep => ({ part: 'w', index, scale: index < 3 ? 'degree' : 'freq' })),
];

/** Option indexes 0–4 (總是 … 從未或幾乎從未, or 很嚴重 … 非常輕微); null until answered. */
export interface CbiAnswers { p: (number | null)[]; w: (number | null)[] }

export const emptyCbi = (): CbiAnswers => ({ p: Array<null>(CBI_PERSONAL_ITEMS).fill(null), w: Array<null>(CBI_WORK_ITEMS).fill(null) });

const isOption = (v: number | null | undefined): v is number => v != null && Number.isInteger(v) && v >= 0 && v <= 4;

export function cbiComplete(a: CbiAnswers): boolean {
  return a.p.length === CBI_PERSONAL_ITEMS && a.w.length === CBI_WORK_ITEMS && [...a.p, ...a.w].every(isOption);
}

export function cbiBody(a: CbiAnswers): CbiBody {
  if (!cbiComplete(a)) throw new Error('CBI is incomplete');
  return { p: a.p.map(Number), w: a.w.map(Number) };
}

const options = (raw: unknown, length: number) => Array.from({ length }, (_, i) => {
  const v: unknown = Array.isArray(raw) ? raw[i] : null;
  return typeof v === 'number' && isOption(v) ? v : null;
});

export const CBI_DRAFT: DraftFormat<CbiAnswers> = {
  empty: emptyCbi,
  read: raw => (isRecord(raw) ? { p: options(raw.p, CBI_PERSONAL_ITEMS), w: options(raw.w, CBI_WORK_ITEMS) } : null),
  openStep: a => {
    const open = CBI_STEPS.findIndex(s => a[s.part][s.index] == null);
    return open === -1 ? CBI_STEPS.length - 1 : open;
  },
};

/** The API accepts 0–744 hours (every hour of a 31-day month). */
export const MAX_MONTH_HOURS = 744;

export const validHours = (v: number | string | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_MONTH_HOURS;

export interface OverloadAnswers {
  /** Overtime hours last month. */
  overtime1m: number | string | null;
  /** Average monthly overtime over the 2–6 months before. */
  overtime6mAvg: number | string | null;
  workPatterns: WorkPattern[];
}

export const emptyOverload = (): OverloadAnswers => ({ overtime1m: null, overtime6mAvg: null, workPatterns: [] });

export function overloadComplete(a: OverloadAnswers): boolean {
  return validHours(a.overtime1m) && validHours(a.overtime6mAvg);
}

/** Steps: overtime last month, the 2–6 month average, then the work patterns. */
export const OVERLOAD_STEPS = 3;

export const OVERLOAD_DRAFT: DraftFormat<OverloadAnswers> = {
  empty: emptyOverload,
  read: raw => {
    if (!isRecord(raw)) return null;
    const hours = (v: unknown) => (validHours(v as number) ? (v as number) : null);
    const patterns = Array.isArray(raw.workPatterns) ? raw.workPatterns : [];
    return { overtime1m: hours(raw.overtime1m), overtime6mAvg: hours(raw.overtime6mAvg), workPatterns: WORK_PATTERNS.filter(p => patterns.includes(p)) };
  },
  openStep: a => (!validHours(a.overtime1m) ? 0 : !validHours(a.overtime6mAvg) ? 1 : OVERLOAD_STEPS - 1),
};

/** Work patterns go to the API as the domain's Chinese values, in the domain's order. */
export function overloadBody(a: OverloadAnswers): OverloadBody {
  if (!validHours(a.overtime1m) || !validHours(a.overtime6mAvg)) throw new Error('Working hours are incomplete');
  return { overtime1m: a.overtime1m, overtime6mAvg: a.overtime6mAvg, workPatterns: WORK_PATTERNS.filter(p => a.workPatterns.includes(p)) };
}
