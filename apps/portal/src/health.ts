/*
 * GET /api/portal/health (MyHealthDto). Rows come typed; only exam grades need narrowing, since the API sends plain
 * numbers and the grade badges take 1–4.
 */
import type { Schemas } from '@yutis/api-client';
import { loadEval, type Grade, type Level3 } from '@yutis/domain';

export type MyExam = Schemas['MyExamDto'];
export type MySurvey = Schemas['MySurveyDto'];
export type MyWorkload = Schemas['MyWorkloadDto'];
/** Why an overwork result has no risk level yet: CBI not filled, working hours not filled, or no health check to use. */
export type RiskMissing = MyWorkload['missing'][number];

export interface ExamItemView { code: string; name: string; unit: string; value: string | null; grade: Grade | null }
export interface ExamView { examDate: string; clinic: string | null; kind: string; gradeMax: Grade | null; items: ExamItemView[] }

const GRADES: readonly number[] = [1, 2, 3, 4] satisfies readonly Grade[];

/** A grade the badges can show; anything else (no grading standard, 0) shows no badge. */
export const asGrade = (n: number | null): Grade | null => (n != null && GRADES.includes(n) ? (n as Grade) : null);

export function examView(e: MyExam): ExamView {
  return {
    examDate: e.examDate, clinic: e.clinic, kind: e.kind, gradeMax: asGrade(e.gradeMax),
    items: e.items.map(i => ({ code: i.code, name: i.name, unit: i.unit, value: i.value, grade: asGrade(i.grade) })),
  };
}

/** The order the reasons read in: the person's own questionnaires first, then what staff must add. */
const MISSING_ORDER: readonly RiskMissing[] = ['cbi', 'overload', 'exam'];

/** Why the risk cannot be judged yet, without repeats, in reading order. */
export const missingReasons = (w: Pick<MyWorkload, 'missing'>): RiskMissing[] => MISSING_ORDER.filter(m => w.missing.includes(m));

/** The person can fix it themselves: one of their own questionnaires is still open in 待辦. */
export const missingOnTasks = (w: Pick<MyWorkload, 'missing'>) => w.missing.some(m => m === 'cbi' || m === 'overload');

/**
 * 輕微 / 中度 / 嚴重 for a CBI score, using the domain's own cut-offs (loadEval: personal ≥ 50 moderate, > 70 severe;
 * work ≥ 45 moderate, > 60 severe) so the portal never disagrees with the back office.
 */
export function burnoutLevel(kind: 'personal' | 'work', score: number): Level3 {
  const load = loadEval({ pf: kind === 'personal' ? score : 0, wf: kind === 'work' ? score : 0, m1: 0, avg6: 0, patterns: [] })!;
  return load.items[kind === 'personal' ? 0 : 1]!.lv;
}
