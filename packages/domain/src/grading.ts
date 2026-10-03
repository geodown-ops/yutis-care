/* Health-check grading (健檢分級). Rules are versioned data; each result stores the rule-set version it was graded with. */

export type Sex = '男' | '女';
export type RuleSex = Sex | '不限';
export type Grade = 1 | 2 | 3 | 4;

export interface NumericLevel { lv: Grade; min?: number; max?: number }
export interface TextLevel { lv: Grade; values: string[] }

interface RuleBase { code: string; name: string; sex: RuleSex; unit: string; src: 'manual' | 'demo' }
export type GradingRule =
  | (RuleBase & { type?: 'number'; levels: NumericLevel[] })
  | (RuleBase & { type: 'text'; levels: TextLevel[] });

export interface ExamItem { key: string; code: string; name: string; unit: string; std: string }

/** Exam items and their codes; the codes are the import mapping key for clinic files. */
export const EXAM_ITEMS: readonly ExamItem[] = [
  { key: 'SBP', code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', std: '90–130' },
  { key: 'DBP', code: 'B0112', name: '血壓－舒張壓', unit: 'mmHg', std: '60–85' },
  { key: 'BMI', code: 'B0104', name: 'BMI', unit: 'kg/m²', std: '18.5–24' },
  { key: 'waist', code: 'B0107', name: '腰圍', unit: 'cm', std: '男 <90；女 <80' },
  { key: 'GLU', code: 'B0201', name: '空腹血糖', unit: 'mg/dL', std: '70–100' },
  { key: 'TC', code: 'B0202', name: '總膽固醇', unit: 'mg/dL', std: '<200' },
  { key: 'TG', code: 'B0203', name: '三酸甘油脂', unit: 'mg/dL', std: '<150' },
  { key: 'HDL', code: 'B0204', name: '高密度脂蛋白膽固醇', unit: 'mg/dL', std: '男 ≥40；女 ≥50' },
  { key: 'LDL', code: 'B0205', name: '低密度脂蛋白膽固醇', unit: 'mg/dL', std: '<130' },
  { key: 'ALT', code: 'B0301', name: '血清丙胺酸轉胺酶（ALT）', unit: 'U/L', std: '<41' },
  { key: 'CR', code: 'B0302', name: '肌酸酐', unit: 'mg/dL', std: '男 0.7–1.3；女 0.6–1.1' },
  { key: 'HB', code: 'B0401', name: '血色素', unit: 'g/dL', std: '男 13–18；女 12–16' },
  { key: 'UPRO', code: 'B0501', name: '尿蛋白', unit: '', std: 'Negative（-）' },
];

/**
 * Default rule set, version 1. `src: 'demo'` marks illustrative thresholds from the prototype
 * that an occupational physician must confirm before production use.
 */
export const RULES_V1: readonly GradingRule[] = [
  { code: 'B0111', name: '收縮壓', sex: '不限', unit: 'mmHg', src: 'manual', levels: [{ lv: 1, max: 140 }, { lv: 2, min: 140, max: 160 }, { lv: 3, min: 160, max: 180 }, { lv: 4, min: 180 }] },
  { code: 'B0112', name: '舒張壓', sex: '不限', unit: 'mmHg', src: 'manual', levels: [{ lv: 1, max: 90 }, { lv: 2, min: 90, max: 100 }, { lv: 3, min: 100, max: 110 }, { lv: 4, min: 110 }] },
  { code: 'B0104', name: 'BMI', sex: '不限', unit: 'kg/m²', src: 'manual', levels: [{ lv: 1, max: 24 }, { lv: 2, min: 24 }] },
  { code: 'B0107', name: '腰圍（女）', sex: '女', unit: 'cm', src: 'manual', levels: [{ lv: 1, max: 80 }, { lv: 2, min: 80 }] },
  { code: 'B0107', name: '腰圍（男）', sex: '男', unit: 'cm', src: 'manual', levels: [{ lv: 1, max: 90 }, { lv: 2, min: 90 }] },
  { code: 'B0201', name: '空腹血糖', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 100 }, { lv: 2, min: 100, max: 126 }, { lv: 3, min: 126, max: 200 }, { lv: 4, min: 200 }] },
  { code: 'B0202', name: '總膽固醇', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 200 }, { lv: 2, min: 200, max: 240 }, { lv: 3, min: 240, max: 280 }, { lv: 4, min: 280 }] },
  { code: 'B0203', name: '三酸甘油脂', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 150 }, { lv: 2, min: 150, max: 200 }, { lv: 3, min: 200, max: 500 }, { lv: 4, min: 500 }] },
  { code: 'B0204', name: '高密度脂蛋白（男）', sex: '男', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, min: 40 }, { lv: 2, max: 40 }] },
  { code: 'B0204', name: '高密度脂蛋白（女）', sex: '女', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, min: 50 }, { lv: 2, max: 50 }] },
  { code: 'B0205', name: '低密度脂蛋白', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 130 }, { lv: 2, min: 130, max: 160 }, { lv: 3, min: 160, max: 190 }, { lv: 4, min: 190 }] },
  { code: 'B0301', name: 'ALT', sex: '不限', unit: 'U/L', src: 'demo', levels: [{ lv: 1, max: 41 }, { lv: 2, min: 41, max: 80 }, { lv: 3, min: 80, max: 200 }, { lv: 4, min: 200 }] },
  { code: 'B0302', name: '肌酸酐（男）', sex: '男', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 1.3 }, { lv: 2, min: 1.3, max: 2 }, { lv: 3, min: 2, max: 4 }, { lv: 4, min: 4 }] },
  { code: 'B0302', name: '肌酸酐（女）', sex: '女', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 1.1 }, { lv: 2, min: 1.1, max: 2 }, { lv: 3, min: 2, max: 4 }, { lv: 4, min: 4 }] },
  { code: 'B0401', name: '血色素（男）', sex: '男', unit: 'g/dL', src: 'demo', levels: [{ lv: 1, min: 13 }, { lv: 2, min: 11, max: 13 }, { lv: 3, min: 9, max: 11 }, { lv: 4, max: 9 }] },
  { code: 'B0401', name: '血色素（女）', sex: '女', unit: 'g/dL', src: 'demo', levels: [{ lv: 1, min: 12 }, { lv: 2, min: 10, max: 12 }, { lv: 3, min: 8, max: 10 }, { lv: 4, max: 8 }] },
  { code: 'B0501', name: '尿蛋白', sex: '不限', unit: '', type: 'text', src: 'demo', levels: [{ lv: 1, values: ['-'] }, { lv: 2, values: ['±'] }, { lv: 3, values: ['+'] }, { lv: 4, values: ['++', '+++'] }] },
];

export function findRule(rules: readonly GradingRule[], code: string, sex: Sex): GradingRule | undefined {
  return rules.find(r => r.code === code && (r.sex === '不限' || r.sex === sex));
}

/** Level for one value; numeric bands are [min, max). Blank values grade as null. */
export function levelOf(rule: GradingRule, v: number | string | null | undefined): Grade | null {
  if (v == null || v === '') return null;
  if (rule.type === 'text') return rule.levels.find(l => l.values.includes(String(v)))?.lv ?? null;
  const x = Number(v);
  return rule.levels.find(l => (l.min == null || x >= l.min) && (l.max == null || x < l.max))?.lv ?? null;
}

export function levelDesc(rule: GradingRule, l: NumericLevel | TextLevel): string {
  if ('values' in l) return l.values.join('、');
  if (l.min == null) return `< ${l.max}`;
  if (l.max == null) return `≥ ${l.min}`;
  return `≥ ${l.min}，< ${l.max}`;
}

export type ExamValues = Record<string, number | string | null | undefined>;
export interface GradedItem extends ExamItem { v: number | string | null | undefined; rule: GradingRule | undefined; lv: Grade | null }
export interface GradeResult { items: GradedItem[]; total: number; max: number }

/** Grade a whole report: per-item level, sum of levels and worst level (ungraded items count as 0). */
export function gradeReport(values: ExamValues, sex: Sex, rules: readonly GradingRule[] = RULES_V1, items: readonly ExamItem[] = EXAM_ITEMS): GradeResult {
  const graded = items.map(it => {
    const rule = findRule(rules, it.code, sex);
    const v = values[it.key];
    return { ...it, v, rule, lv: rule ? levelOf(rule, v) : null };
  });
  const lv: number[] = graded.map(i => i.lv ?? 0);
  return { items: graded, total: lv.reduce((a, b) => a + b, 0), max: Math.max(0, ...lv) };
}
