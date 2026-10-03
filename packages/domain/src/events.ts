/* Abnormal-event triggers that open a case, and the case status flow. */

export const EVENT_TYPES = {
  hc: { label: '健檢報告分級3、4級', short: '健檢 3–4 級' },
  wl: { label: '異常工作負荷', short: '異常負荷' },
  er: { label: '人因性危害', short: '人因' },
  mat: { label: '母性健康保護', short: '母性' },
  age: { label: '18歲以下或中高齡', short: '年齡關注' },
  sp: { label: '特殊健檢異常', short: '特殊健檢' },
} as const;
export type EventType = keyof typeof EVENT_TYPES;

export const CASE_STATUSES = ['未開單', '起單', '處理中', '結案'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Health-check grade at or above this opens an event. */
export const EXAM_EVENT_GRADE = 3;
/** Special health-check management level at or above this opens an event. */
export const SPECIAL_EVENT_LEVEL = 2;
/** Age-concern thresholds: under MINOR_AGE or at least SENIOR_AGE. Tenants may adjust SENIOR_AGE. */
export const MINOR_AGE = 18;
export const SENIOR_AGE = 55;

export function isAgeConcern(age: number, seniorAge = SENIOR_AGE): boolean {
  return age < MINOR_AGE || age >= seniorAge;
}

/**
 * Case status shown for an employee: a closed case reopens as 未開單 when a new event arrives.
 */
export function caseStatus(current: CaseStatus | null | undefined, eventStatuses: readonly CaseStatus[]): CaseStatus {
  if (!current) return '未開單';
  if (current === '結案' && eventStatuses.includes('未開單')) return '未開單';
  return current;
}

/**
 * Allowed case status changes: a nurse opens a case (起單), works it (處理中) and closes it (結案). A closed case is
 * reopened by opening it again, which starts a new 起單.
 */
export const CASE_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  未開單: ['起單'],
  起單: ['處理中', '結案'],
  處理中: ['結案'],
  結案: [],
};

export function canMoveCase(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}
