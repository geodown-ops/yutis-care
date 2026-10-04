/*
 * GET /api/portal/health. openapi.json declares its rows only as objects (MyHealthDto), so each field is read and
 * checked here rather than trusting a shape; the fields are the ones PortalController.myHealth() returns.
 */
import type { Schemas } from '@yutis/api-client';
import { loadEval, type Grade, type Level3 } from '@yutis/domain';

type Row = Schemas['MyHealthDto']['exams'][number];

const text = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const oneOf = <T extends number>(v: unknown, allowed: readonly T[]): T | null => {
  const n = num(v);
  return allowed.includes(n as T) ? (n as T) : null;
};
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : []);

const GRADES = [1, 2, 3, 4] as const satisfies readonly Grade[];
const LEVELS = [0, 1, 2] as const satisfies readonly Level3[];

export interface ExamItemView { code: string; name: string; unit: string; value: string | null; grade: Grade | null }
export interface ExamView { examDate: string; clinic: string | null; kind: string | null; gradeMax: Grade | null; items: ExamItemView[] }
export interface SurveyView { dispatch: string; filledAt: string | null; maxScore: number | null; suspectedHazard: boolean | null }
export interface WorkloadView { sentOn: string; personalBurnout: number | null; workBurnout: number | null; riskLevel: Level3 | null }

export function examViews(exams: Row[]): ExamView[] {
  return exams.flatMap(e => {
    const examDate = text(e.examDate);
    if (!examDate) return [];
    const items = rows(e.items).flatMap(i => {
      const code = text(i.code);
      return code ? [{ code, name: text(i.name) ?? code, unit: text(i.unit) ?? '', value: text(i.value), grade: oneOf(i.grade, GRADES) }] : [];
    });
    return [{ examDate, clinic: text(e.clinic), kind: text(e.kind), gradeMax: oneOf(e.gradeMax, GRADES), items }];
  });
}

export function surveyViews(surveys: Row[]): SurveyView[] {
  return surveys.map(s => ({
    dispatch: text(s.dispatch) ?? '', filledAt: text(s.filledAt), maxScore: num(s.maxScore),
    suspectedHazard: typeof s.suspectedHazard === 'boolean' ? s.suspectedHazard : null,
  }));
}

export function workloadViews(workload: Row[]): WorkloadView[] {
  return workload.flatMap(w => {
    const sentOn = text(w.sentOn);
    return sentOn ? [{ sentOn, personalBurnout: num(w.personalBurnout), workBurnout: num(w.workBurnout), riskLevel: oneOf(w.riskLevel, LEVELS) }] : [];
  });
}

/**
 * 輕微 / 中度 / 嚴重 for a CBI score, using the domain's own cut-offs (loadEval: personal ≥ 50 moderate, > 70 severe;
 * work ≥ 45 moderate, > 60 severe) so the portal never disagrees with the back office.
 */
export function burnoutLevel(kind: 'personal' | 'work', score: number): Level3 {
  const load = loadEval({ pf: kind === 'personal' ? score : 0, wf: kind === 'work' ? score : 0, m1: 0, avg6: 0, patterns: [] })!;
  return load.items[kind === 'personal' ? 0 : 1]!.lv;
}
