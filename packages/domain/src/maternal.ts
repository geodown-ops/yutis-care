/* Maternal health protection (工作場所母性健康保護). */

import { diffDays, type IsoDate } from './dates.js';

export const MAT_LEVELS = ['第一級管理', '第二級管理', '第三級管理'] as const;
export type MatLevel = (typeof MAT_LEVELS)[number];
export type HazardAnswer = '有' | '可能有影響' | '無' | string;

/** Suggested management level from the hazard assessment: any 有 → 3, any 可能有影響 → 2, else 1. */
export function suggestMaternalLevel(hazards: Record<string, { v: HazardAnswer }> | null | undefined): MatLevel {
  const vals = Object.values(hazards ?? {}).map(h => h.v);
  return vals.includes('有') ? '第三級管理' : vals.includes('可能有影響') ? '第二級管理' : '第一級管理';
}

/** Gestational week on `today`, from the due date (40 weeks). Empty when not a pregnancy or not yet started. */
export function pregnancyWeeks(type: string, due: IsoDate | null | undefined, today: IsoDate): number | null {
  if (type !== '妊娠' || !due) return null;
  const w = 40 - Math.ceil(diffDays(due, today) / 7);
  return w > 0 ? w : null;
}
