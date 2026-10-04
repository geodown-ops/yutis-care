import { describe, expect, it } from 'vitest';
import { phraseCategories, pickCategory, type Phrase } from './phrases';

const phrase = (id: string, category: string): Phrase => ({ id, category, text: `片語 ${id}`, kind: null });

describe('phrase categories', () => {
  const list = [phrase('1', '健康諮詢'), phrase('2', '健康諮詢'), phrase('3', '不法侵害－措施'), phrase('4', '健康諮詢')];

  it('counts phrases per category in the order first seen', () => {
    expect(phraseCategories(list)).toEqual([{ category: '健康諮詢', count: 3 }, { category: '不法侵害－措施', count: 1 }]);
    expect(phraseCategories([])).toEqual([]);
  });

  it('keeps the chosen category while it exists, else shows the first', () => {
    const cats = phraseCategories(list);
    expect(pickCategory(cats, '不法侵害－措施')).toBe('不法侵害－措施');
    expect(pickCategory(cats, '已刪光的分類')).toBe('健康諮詢');
    expect(pickCategory(cats, null)).toBe('健康諮詢');
    expect(pickCategory([], '健康諮詢')).toBeNull();
  });
});
