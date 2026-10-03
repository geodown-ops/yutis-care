import { ConflictException } from '@nestjs/common';
import { gradingRules, gradingRuleSets, type Tx } from '@yutis/db';
import type { GradingRule } from '@yutis/domain';
import { desc, eq } from 'drizzle-orm';

export interface RuleSet { id: string; version: number; rules: GradingRule[] }

/** A rule row as @yutis/domain expects it. */
export function toDomainRule(r: typeof gradingRules.$inferSelect): GradingRule {
  const base = { code: r.itemCode, name: r.name, sex: r.sex, unit: r.unit, src: r.source === 'manual' ? 'manual' : 'demo' } as const;
  return r.valueType === 'text'
    ? { ...base, type: 'text', levels: r.levels as Extract<GradingRule, { type: 'text' }>['levels'] }
    : { ...base, levels: r.levels as Extract<GradingRule, { type?: 'number' }>['levels'] };
}

export async function loadRuleSet(tx: Tx, id: string): Promise<RuleSet> {
  const [set] = await tx.select().from(gradingRuleSets).where(eq(gradingRuleSets.id, id));
  const rows = await tx.select().from(gradingRules).where(eq(gradingRules.ruleSetId, id));
  return { id, version: set!.version, rules: rows.map(toDomainRule) };
}

/** The rule set new results are graded with: the newest published version. */
export async function currentRuleSet(tx: Tx): Promise<RuleSet> {
  const [set] = await tx.select().from(gradingRuleSets).where(eq(gradingRuleSets.status, 'published'))
    .orderBy(desc(gradingRuleSets.version)).limit(1);
  if (!set) throw new ConflictException({ code: 'no_rule_set', message: 'No published grading rule set; the tenant has no grading standard yet' });
  return loadRuleSet(tx, set.id);
}

export async function ruleSetVersions(tx: Tx, ids: string[]): Promise<Map<string, number>> {
  const sets = await tx.select({ id: gradingRuleSets.id, version: gradingRuleSets.version }).from(gradingRuleSets);
  return new Map(sets.filter(s => ids.includes(s.id)).map(s => [s.id, s.version]));
}
