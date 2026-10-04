/*
 * Pure helpers for 工作場所母性健康保護 over /api/programs/maternal/* and GET /api/programs/work-advice.
 * Form vocabularies follow the prototype (作業場所危害評估表、附表四 工作適性安排建議).
 */
import type { Schemas } from '@yutis/api-client';
import { MAT_LEVELS, suggestMaternalLevel, type IsoDate, type MatLevel } from '@yutis/domain';

export type EnvAssessment = Schemas['EnvAssessmentDto'];
export type MaternalCase = Schemas['MaternalCaseDto'];
export type WorkAdvice = Schemas['WorkAdviceDto'];
export type HazardAnswer = '無' | '可能有影響' | '有';
export interface HazardDraft { v: HazardAnswer; note: string }

export const MAT_HAZARDS = ['物理性危害', '化學性危害', '生物性危害', '人因性危害', '工作壓力／職場暴力', '其他'] as const;
export const HAZARD_ANSWERS: readonly HazardAnswer[] = ['無', '可能有影響', '有'];
export const SHIFT_TYPES = ['常日班', '輪班', '其他'] as const;
export const MAT_SELF = ['孕吐或食慾不振', '下背痛', '水腫', '睡眠不足', '情緒低落或焦慮', '有慢性病（高血壓、糖尿病等）', '多胞胎或高危險妊娠', '曾流產或早產'] as const;
export const FIT_ADVICE = ['可繼續從事目前工作', '可繼續從事工作，但須考量下列條件限制', '不可繼續從事目前工作'] as const;
export const FIT_LIMITS = ['變更工作場所', '變更職務', '縮減工作時間', '限制夜班', '限制加班', '限制負重或搬運', '其他'] as const;
export const MAT_AGREE = ['維持原工作', '調整職務', '調整工作時間', '變更工作場所', '其他'] as const;

export const LEVEL_TONE: Record<MatLevel, 'ok' | 'warn' | 'bad'> = { 第一級管理: 'ok', 第二級管理: 'warn', 第三級管理: 'bad' };
export const isMatLevel = (v: unknown): v is MatLevel => (MAT_LEVELS as readonly unknown[]).includes(v);

export const emptyHazards = (): Record<string, HazardDraft> => Object.fromEntries(MAT_HAZARDS.map(h => [h, { v: '無', note: '' }]));

/** The hazards body for POST env-assessments: every hazard answered, empty notes left out. */
export function hazardsBody(draft: Record<string, HazardDraft>) {
  return Object.fromEntries(Object.entries(draft).map(([k, h]) => [k, h.note.trim() ? { v: h.v, note: h.note.trim() } : { v: h.v }]));
}

/** The level the API will store for these answers (any 有 → 3, any 可能有影響 → 2, else 1). */
export const suggestedLevel = (draft: Record<string, HazardDraft>): MatLevel => suggestMaternalLevel(draft);

/** Hazards answered other than 無, read from the stored jsonb (unknown shape on the wire). */
export function hazardFindings(hazards: unknown): { name: string; v: string; note: string }[] {
  if (!hazards || typeof hazards !== 'object') return [];
  return Object.entries(hazards as Record<string, unknown>).flatMap(([name, h]) => {
    const v = h && typeof h === 'object' && 'v' in h ? String((h as { v: unknown }).v) : '';
    const note = h && typeof h === 'object' && 'note' in h && typeof (h as { note: unknown }).note === 'string' ? (h as { note: string }).note : '';
    return v && v !== '無' ? [{ name, v, note }] : [];
  });
}

export function countByLevel(envs: readonly Pick<EnvAssessment, 'level'>[]): Record<MatLevel, number> {
  const out = Object.fromEntries(MAT_LEVELS.map(l => [l, 0])) as Record<MatLevel, number>;
  for (const e of envs) if (isMatLevel(e.level)) out[e.level] += 1;
  return out;
}

/** 妊娠 or 產後 (the API stores 產後; older imports say 產後一年內). */
export const isPostpartum = (type: string) => type.startsWith('產後');
export const typeLabel = (type: string) => (isPostpartum(type) ? '產後一年內' : type);

/**
 * Interviews of each case. The case list carries no interviews, so they come from the work advice (one row per
 * maternal interview): same employee, on or after the notification, and before that employee's next notification.
 */
export function interviewsByCase(cases: readonly MaternalCase[], advice: readonly WorkAdvice[]): Map<string, WorkAdvice[]> {
  const out = new Map<string, WorkAdvice[]>(cases.map(c => [c.id, []]));
  const maternal = advice.filter(a => a.programme === '母性健康保護' && a.on);
  for (const c of cases) {
    const next = cases
      .filter(o => o.employeeId === c.employeeId && o.notifiedOn > c.notifiedOn)
      .reduce<string | null>((d, o) => (!d || o.notifiedOn < d ? o.notifiedOn : d), null);
    const mine = maternal.filter(a => a.employeeId === c.employeeId && a.on! >= c.notifiedOn && (!next || a.on! < next));
    out.set(c.id, mine.sort((a, b) => b.on!.localeCompare(a.on!)));
  }
  return out;
}

/** Self-reported symptoms and a free note, as the case's encrypted detail text. */
export function composeDetail(items: readonly string[], note: string): string | null {
  const parts = [items.length ? `自述症狀：${items.join('、')}` : '', note.trim()].filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

/** What the employee agrees to (建議員工接受之事項) plus a free note, as one sentence for agreedArrangement. */
export function composeArrangement(items: readonly string[], note: string): string {
  return [items.join('、'), note.trim()].filter(Boolean).join('；');
}

export interface CaseDraft { employeeId: string | null; type: '妊娠' | '產後'; notifiedOn: string; dueDate: string; birthDate: string }

/** First missing or inconsistent field of a new notification, or null when it can be sent. */
export function caseDraftProblem(d: CaseDraft, today: IsoDate): string | null {
  if (!d.employeeId) return '請選擇員工。';
  if (!d.notifiedOn) return '請填寫通報日期。';
  if (d.notifiedOn > today) return '通報日期不能晚於今天。';
  if (d.type === '妊娠' && !d.dueDate) return '妊娠通報請填寫預產期。';
  if (d.type === '產後' && !d.birthDate) return '產後通報請填寫分娩日期。';
  if (d.type === '產後' && d.birthDate > today) return '分娩日期不能晚於今天。';
  return null;
}
