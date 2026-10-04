/*
 * Grading standards (分級標準). Published and retired versions never change: changing the standard means saving the
 * edited rules as a new draft (which can still be replaced or deleted) and publishing it. Numeric bands are [min, max),
 * as in @yutis/domain levelOf.
 */
import type { TenantPaths } from '@yutis/api-client';

type NewRuleSet = TenantPaths['/api/admin/rule-sets']['post']['requestBody']['content']['application/json'];
export type Rule = NewRuleSet['rules'][number];
export type RuleLevel = Rule['levels'][number];
export type RuleSetStatus = 'draft' | 'published' | 'retired';

/** The tabs of the 分級標準、片語、簽核角色 page (?tab= in the URL; grading is the default). */
export const RULES_TABS = ['grading', 'phrases', 'sign-off'] as const;
export type RulesTab = (typeof RULES_TABS)[number];

export const STATUS_LABEL: Record<RuleSetStatus, string> = { draft: '草稿', published: '使用中', retired: '已停用' };
export const SRC_LABEL: Record<NonNullable<Rule['src']>, string> = { manual: '手冊', demo: '示意', physician: '職醫確認' };

/** The rules of GET /api/admin/rule-sets/{id} (typed loosely in the contract; same shape as the create body). */
export const readRules = (rules: readonly unknown[]): Rule[] => rules as Rule[];

export const ruleKey = (r: Pick<Rule, 'code' | 'sex'>) => `${r.code}/${r.sex}`;
export const isText = (r: Pick<Rule, 'type'>) => r.type === 'text';

export function levelText(l: RuleLevel): string {
  if ('values' in l) return l.values.join('、');
  if (l.min == null && l.max == null) return '不限';
  if (l.min == null) return `< ${l.max}`;
  if (l.max == null) return `≥ ${l.min}`;
  return `≥ ${l.min}，< ${l.max}`;
}

/** One level as typed in the editor: bounds and text values stay strings until saved. */
export interface LevelDraft { lv: number; min: string; max: string; values: string }

export const toDrafts = (r: Rule): LevelDraft[] => r.levels.map(l => 'values' in l
  ? { lv: l.lv, min: '', max: '', values: l.values.join('、') }
  : { lv: l.lv, min: l.min == null ? '' : String(l.min), max: l.max == null ? '' : String(l.max), values: '' });

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.trim()));
const splitValues = (s: string) => s.split(/[、,，;；\s]+/).map(v => v.trim()).filter(Boolean);

export function fromDrafts(r: Rule, drafts: readonly LevelDraft[]): Rule {
  const levels: RuleLevel[] = drafts.map(d => {
    if (isText(r)) return { lv: d.lv, values: splitValues(d.values) };
    const min = num(d.min), max = num(d.max);
    return { lv: d.lv, ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
  });
  return { ...r, levels };
}

/** Problems that would make the rule grade wrongly; empty when it can be saved. */
export function levelProblems(r: Rule, drafts: readonly LevelDraft[]): string[] {
  if (isText(r)) {
    const p = drafts.filter(d => splitValues(d.values).length === 0).map(d => `第 ${d.lv} 級至少要有一個結果值`);
    const all = drafts.flatMap(d => splitValues(d.values));
    const dup = [...new Set(all.filter((v, i) => all.indexOf(v) !== i))];
    if (dup.length) p.push(`${dup.join('、')} 出現在不只一級`);
    return p;
  }
  const p: string[] = [];
  for (const d of drafts) {
    const min = num(d.min), max = num(d.max);
    if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) p.push(`第 ${d.lv} 級的數值格式不正確`);
    else if (min !== undefined && max !== undefined && min >= max) p.push(`第 ${d.lv} 級的下限必須小於上限`);
  }
  if (p.length) return p;
  // The bands together must cover every value exactly once: lowest open below, highest open above, no gaps or overlaps.
  const bands = drafts.map(d => ({ lv: d.lv, min: num(d.min) ?? -Infinity, max: num(d.max) ?? Infinity })).sort((a, b) => a.min - b.min);
  if (bands[0]!.min !== -Infinity) p.push(`低於 ${bands[0]!.min} 的數值沒有對應的級數`);
  if (bands.at(-1)!.max !== Infinity) p.push(`${bands.at(-1)!.max} 以上的數值沒有對應的級數`);
  for (let i = 1; i < bands.length; i++) {
    const a = bands[i - 1]!, b = bands[i]!;
    if (a.max < b.min) p.push(`${a.max} 到 ${b.min} 之間的數值沒有對應的級數`);
    if (a.max > b.min) p.push(`第 ${a.lv} 級與第 ${b.lv} 級的範圍重疊`);
  }
  return p;
}

const levelsKey = (r: Rule) => JSON.stringify(r.levels.map(l => ('values' in l ? [l.lv, [...l.values]] : [l.lv, l.min ?? null, l.max ?? null])));

/** Keys of the rules whose levels differ from the base version. */
export function changedRules(base: readonly Rule[], edited: readonly Rule[]): Set<string> {
  const before = new Map(base.map(r => [ruleKey(r), levelsKey(r)]));
  return new Set(edited.filter(r => before.get(ruleKey(r)) !== levelsKey(r)).map(ruleKey));
}

/** The version a screen opens on: the one in use, else the newest. */
export const defaultVersion = <T extends { status: string }>(sets: readonly T[]): T | undefined => sets.find(s => s.status === 'published') ?? sets[0];
