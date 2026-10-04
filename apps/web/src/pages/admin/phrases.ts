/* The phrase library (片語庫): short texts care staff insert into records and measures. */
import type { Schemas } from '@yutis/api-client';

export type Phrase = Schemas['PhraseDto'];
export type PhraseKind = NonNullable<Phrase['kind']>;
export const KIND_LABEL: Record<PhraseKind, string> = { 改善: '應增加或改善', 建議: '建議可採行' };

/** Categories with their phrase counts, in the order the API lists them (by category). */
export function phraseCategories(phrases: readonly Phrase[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of phrases) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts].map(([category, count]) => ({ category, count }));
}

/** The category to show: the one asked for while it still has phrases, else the first. */
export const pickCategory = (categories: readonly { category: string }[], wanted: string | null) =>
  categories.find(c => c.category === wanted)?.category ?? categories[0]?.category ?? null;
