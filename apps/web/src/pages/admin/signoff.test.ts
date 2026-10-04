import { describe, expect, it } from 'vitest';
import { moveItem, sameList, signOffRoleProblems } from './signoff';

describe('sign-off roles', () => {
  it('accepts a list of distinct names', () => {
    expect(signOffRoleProblems(['勞工健康服務醫師', '人力資源管理人員'])).toEqual([]);
  });

  it('needs at least one role and at most 30', () => {
    expect(signOffRoleProblems([])).toEqual(['至少要有一個簽核角色']);
    expect(signOffRoleProblems(Array.from({ length: 31 }, (_, i) => `角色${i}`))).toEqual(['最多 30 個簽核角色']);
  });

  it('refuses blank, too long and repeated names (after trimming)', () => {
    expect(signOffRoleProblems(['勞工代表', '  '])).toEqual(['角色名稱不能空白']);
    expect(signOffRoleProblems(['長'.repeat(51)])).toEqual([`角色名稱最多 50 字：${'長'.repeat(51)}`]);
    expect(signOffRoleProblems(['勞工代表', ' 勞工代表 ', '其他'])).toEqual(['角色重複：勞工代表']);
  });

  it('moves a role up or down and stays put at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('compares an edited list with the saved one, ignoring surrounding spaces', () => {
    expect(sameList([' a', 'b '], ['a', 'b'])).toBe(true);
    expect(sameList(['b', 'a'], ['a', 'b'])).toBe(false);
    expect(sameList(['a'], ['a', 'b'])).toBe(false);
  });
});
