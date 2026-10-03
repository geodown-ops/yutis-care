/* Overwork (異常工作負荷促發疾病預防): 10-year cardiovascular risk × workload level → interview advice. */

import { ageAt, type IsoDate } from './dates.js';
import type { ExamValues, Sex } from './grading.js';

export type Level3 = 0 | 1 | 2;
export const RISK_LABEL = ['低度風險', '中度風險', '高度風險'] as const;
export const LOAD_LABEL = ['低負荷', '中負荷', '高負荷'] as const;
export const ADVICE = ['不需面談', '建議面談', '需面談'] as const;
/** MATRIX[10-year CVD band][workload level] → risk level. */
export const MATRIX: readonly (readonly Level3[])[] = [[0, 0, 1], [0, 1, 2], [1, 2, 2]];

interface CvdTable { age: number[]; ldl: number[]; hdl: number[]; bp: number[]; dm: number; smoke: number; risk: (p: number) => number }

/**
 * Simplified Framingham point score (LDL version), carried over from the prototype as an illustration.
 * Production must replace these tables with the guideline's own appendix, confirmed by an occupational physician.
 */
const CVD: Record<Sex, CvdTable> = {
  男: {
    age: [-1, 0, 1, 2, 3, 4, 5, 6, 7], ldl: [-3, 0, 0, 1, 2], hdl: [2, 1, 0, 0, -1], bp: [0, 0, 1, 2, 3], dm: 2, smoke: 2,
    risk: p => p <= -3 ? 1 : ({ '-2': 2, '-1': 2, 0: 3, 1: 4, 2: 4, 3: 6, 4: 7, 5: 9, 6: 11, 7: 14, 8: 18, 9: 22, 10: 27, 11: 33, 12: 40, 13: 47 } as Record<string, number>)[p] ?? 56,
  },
  女: {
    age: [-9, -4, 0, 3, 6, 7, 8, 8, 8], ldl: [-2, 0, 0, 2, 2], hdl: [5, 2, 1, 0, -2], bp: [-3, 0, 0, 2, 3], dm: 4, smoke: 2,
    risk: p => p <= -2 ? 1 : ({ '-1': 2, 0: 2, 1: 2, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 11, 11: 13, 12: 15, 13: 17, 14: 20, 15: 24, 16: 27 } as Record<string, number>)[p] ?? 32,
  },
};

export interface CvdInput {
  sex: Sex;
  birth: IsoDate;
  /** The health-check report the score is based on. */
  report: { date: IsoDate; values: ExamValues; history?: string; smoker?: boolean };
}
export interface CvdItem { name: string; value: string; pts: number }
export interface CvdResult { items: CvdItem[]; total: number; risk: number; band: Level3 }

const at = (arr: number[], i: number): number => arr[i] ?? 0;

export function cvdScore({ sex, birth, report }: CvdInput): CvdResult {
  const T = CVD[sex];
  const v = report.values;
  const a = ageAt(birth, report.date);
  const ai = Math.min(8, Math.max(0, Math.floor((a - 30) / 5)));
  const ldl = Number(v.LDL), hdl = Number(v.HDL), sbp = Number(v.SBP), dbp = Number(v.DBP);
  const li = ldl < 100 ? 0 : ldl < 130 ? 1 : ldl < 160 ? 2 : ldl < 190 ? 3 : 4;
  const hi = hdl < 35 ? 0 : hdl < 45 ? 1 : hdl < 50 ? 2 : hdl < 60 ? 3 : 4;
  const bi = (sbp >= 160 || dbp >= 100) ? 4 : (sbp >= 140 || dbp >= 90) ? 3 : (sbp >= 130 || dbp >= 85) ? 2 : (sbp >= 120 || dbp >= 80) ? 1 : 0;
  const dm = Number(v.GLU) >= 126 || /糖尿病/.test(report.history ?? '');
  const smoke = !!report.smoker;
  const items: CvdItem[] = [
    { name: '年齡', value: `${a} 歲`, pts: at(T.age, ai) },
    { name: '低密度脂蛋白膽固醇', value: `${ldl} mg/dL`, pts: at(T.ldl, li) },
    { name: '高密度脂蛋白膽固醇', value: `${hdl} mg/dL`, pts: at(T.hdl, hi) },
    { name: '血壓', value: `${sbp}/${dbp} mmHg`, pts: at(T.bp, bi) },
    { name: '糖尿病', value: dm ? '有' : '無', pts: dm ? T.dm : 0 },
    { name: '吸菸', value: smoke ? '有' : '無', pts: smoke ? T.smoke : 0 },
  ];
  const total = items.reduce((s, i) => s + i.pts, 0);
  const risk = T.risk(total);
  return { items, total, risk, band: risk >= 20 ? 2 : risk >= 10 ? 1 : 0 };
}

export interface LoadInput {
  /** Personal and work-related burnout scores (0–100). */
  pf: number | null; wf: number | null;
  /** Overtime hours last month and 6-month average. */
  m1: number | null; avg6: number | null;
  /** Selected work patterns (輪班、出差…). */
  patterns: readonly string[];
}
export interface LoadItem { name: string; value: string; lv: Level3 }
export interface LoadResult { items: LoadItem[]; level: Level3; ot: Level3 }

export function loadEval(a: LoadInput): LoadResult | null {
  if (a.pf == null || a.m1 == null) return null;
  const wf = a.wf ?? 0, avg6 = a.avg6 ?? 0;
  const lp: Level3 = a.pf > 70 ? 2 : a.pf >= 50 ? 1 : 0;
  const lw: Level3 = wf > 60 ? 2 : wf >= 45 ? 1 : 0;
  const lo: Level3 = (a.m1 > 100 || avg6 > 80) ? 2 : (a.m1 >= 45 || avg6 >= 45) ? 1 : 0;
  const n = a.patterns.length;
  const lt: Level3 = n >= 4 ? 2 : n >= 2 ? 1 : 0;
  const items: LoadItem[] = [
    { name: '個人相關過勞', value: `${a.pf} 分`, lv: lp },
    { name: '工作相關過勞', value: `${a.wf} 分`, lv: lw },
    { name: '月加班時數', value: `近 1 個月 ${a.m1} 小時；近 6 個月平均 ${a.avg6} 小時`, lv: lo },
    { name: '工作型態', value: `${n} 項`, lv: lt },
  ];
  return { items, level: Math.max(lp, lw, lo, lt) as Level3, ot: lo };
}

export type WorkloadResult =
  | { complete: false; cvd: CvdResult | null; load: LoadResult | null }
  | { complete: true; cvd: CvdResult; load: LoadResult; riskLevel: Level3; advice: (typeof ADVICE)[number]; shortM: string; longM: string };

const LONG_MEASURES = [
  '維持現行工作安排，持續健康促進並於下次健檢後重新評估。',
  '建議改變生活型態，考慮醫療協助，調整工作型態，至少每半年追蹤一次。',
  '應盡速安排醫師面談，不宜加班並限制工作時間，必要時考慮醫療協助，至少每 3 個月追蹤一次。',
] as const;

/** Combine the CVD band and workload level through the risk matrix. Either input missing → incomplete. */
export function evaluateWorkload(cvd: CvdResult | null, load: LoadResult | null): WorkloadResult {
  if (!cvd || !load) return { complete: false, cvd, load };
  const lv = MATRIX[cvd.band]?.[load.level] ?? 0;
  const shortM = lv === 0 ? '—' : lv === 1 ? (load.ot >= 1 ? '限制加班 10 小時／月' : '調整工作型態') : (load.ot >= 1 ? '不宜加班' : '限制工作時間 09:00–18:00');
  return { complete: true, cvd, load, riskLevel: lv, advice: ADVICE[lv], shortM, longM: LONG_MEASURES[lv] };
}

/* Copenhagen Burnout Inventory, Taiwan workplace version: 6 personal items, 7 work items (the last reverse-scored). */
export const CBI_WORK_REVERSED: readonly boolean[] = [false, false, false, false, false, false, true];
const CBI_VALUES = [100, 75, 50, 25, 0];

/** Answers are option indexes 0–4 (總是…從未). Returns mean scores rounded to one decimal. */
export function cbiScores(ans: { p: readonly number[]; w: readonly number[] }): { pf: number; wf: number } {
  const val = (i: number) => CBI_VALUES[i] ?? 0;
  const p = ans.p.map(val);
  const w = ans.w.map((x, i) => CBI_WORK_REVERSED[i] ? 100 - val(x) : val(x));
  const avg = (arr: number[]) => +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1);
  return { pf: avg(p), wf: avg(w) };
}
