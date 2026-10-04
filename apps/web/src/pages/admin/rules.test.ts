import { describe, expect, it } from 'vitest';
import { changedRules, defaultVersion, fromDrafts, levelProblems, levelText, toDrafts, type Rule } from './rules';

const DBP: Rule = { code: 'B0112', name: '舒張壓', sex: '不限', unit: 'mmHg', src: 'manual', levels: [{ lv: 1, max: 90 }, { lv: 2, min: 90, max: 100 }, { lv: 3, min: 100, max: 110 }, { lv: 4, min: 110 }] };
const HB: Rule = { code: 'B0401', name: '血色素（男）', sex: '男', unit: 'g/dL', src: 'demo', levels: [{ lv: 1, min: 13 }, { lv: 2, min: 11, max: 13 }, { lv: 3, min: 9, max: 11 }, { lv: 4, max: 9 }] };
const UPRO: Rule = { code: 'B0501', name: '尿蛋白', sex: '不限', unit: '', type: 'text', src: 'demo', levels: [{ lv: 1, values: ['-'] }, { lv: 2, values: ['±'] }, { lv: 3, values: ['+'] }, { lv: 4, values: ['++', '+++'] }] };

describe('grading rule helpers', () => {
  it('describes bands as [min, max)', () => {
    expect(DBP.levels.map(levelText)).toEqual(['< 90', '≥ 90，< 100', '≥ 100，< 110', '≥ 110']);
    expect(levelText(UPRO.levels[3]!)).toBe('++、+++');
  });

  it('round-trips rules through the editor unchanged', () => {
    for (const r of [DBP, HB, UPRO]) {
      expect(fromDrafts(r, toDrafts(r))).toEqual(r);
      expect(levelProblems(r, toDrafts(r))).toEqual([]);
    }
  });

  it('reads text values separated by 、 or commas', () => {
    const d = toDrafts(UPRO);
    d[3] = { ...d[3]!, values: '++, +++，++++' };
    expect(fromDrafts(UPRO, d).levels[3]).toEqual({ lv: 4, values: ['++', '+++', '++++'] });
  });

  it('refuses a band whose lower bound is not below the upper bound', () => {
    const d = toDrafts(DBP);
    d[1] = { ...d[1]!, min: '120' };
    expect(levelProblems(DBP, d)).toEqual(['第 2 級的下限必須小於上限']);
  });

  it('refuses numbers it cannot read', () => {
    const d = toDrafts(DBP);
    d[0] = { ...d[0]!, max: '9o' };
    expect(levelProblems(DBP, d)).toEqual(['第 1 級的數值格式不正確']);
  });

  it('finds gaps, overlaps and open ends, whichever way the grades run', () => {
    const gap = toDrafts(DBP);
    gap[1] = { ...gap[1]!, min: '92' };
    expect(levelProblems(DBP, gap)).toEqual(['90 到 92 之間的數值沒有對應的級數']);
    const overlap = toDrafts(HB);
    overlap[1] = { ...overlap[1]!, max: '14' };
    expect(levelProblems(HB, overlap)).toEqual(['第 2 級與第 1 級的範圍重疊']);
    const closed = toDrafts(DBP);
    closed[3] = { ...closed[3]!, max: '200' };
    expect(levelProblems(DBP, closed)).toEqual(['200 以上的數值沒有對應的級數']);
  });

  it('refuses a text result in two grades or a grade with none', () => {
    const d = toDrafts(UPRO);
    d[1] = { ...d[1]!, values: '' };
    d[2] = { ...d[2]!, values: '+、-' };
    expect(levelProblems(UPRO, d)).toEqual(['第 2 級至少要有一個結果值', '- 出現在不只一級']);
  });

  it('marks only the rules whose levels changed (rules are keyed by code and sex)', () => {
    const edited = [{ ...DBP, levels: [{ lv: 1, max: 85 }, ...DBP.levels.slice(1)] }, HB, UPRO];
    expect([...changedRules([DBP, HB, UPRO], edited)]).toEqual(['B0112/不限']);
    // Key order inside a level does not matter.
    expect(changedRules([DBP], [{ ...DBP, levels: DBP.levels.map(l => ('max' in l && 'min' in l ? { max: l.max, min: l.min, lv: l.lv } : l)) }]).size).toBe(0);
  });

  it('opens on the version in use, else the newest', () => {
    expect(defaultVersion([{ id: 'b', status: 'draft' }, { id: 'a', status: 'published' }])?.id).toBe('a');
    expect(defaultVersion([{ id: 'c', status: 'draft' }, { id: 'a', status: 'retired' }])?.id).toBe('c');
    expect(defaultVersion([])).toBeUndefined();
  });
});
