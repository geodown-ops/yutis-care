/*
 * Statutory retention of health records (保存年限), from 勞工健康保護規則 as summarised in the architecture document:
 * general health checks 7 years, special health checks 10 years (some special operations 30). To be confirmed by legal
 * counsel before production. Expired rows are listed for manual review; nothing is deleted automatically.
 */
import { parseDate, toIsoDate, type IsoDate } from './dates.js';

export const RETENTION_YEARS = { generalExam: 7, specialExam: 10 } as const;

export function examRetainUntil(examDate: IsoDate, special: boolean): IsoDate {
  const d = parseDate(examDate);
  d.setFullYear(d.getFullYear() + (special ? RETENTION_YEARS.specialExam : RETENTION_YEARS.generalExam));
  return toIsoDate(d);
}
