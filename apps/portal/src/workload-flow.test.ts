import { CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, cbiScores, WORK_PATTERNS } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import { CBI_STEPS, cbiBody, cbiComplete, emptyCbi, overloadBody, overloadComplete, validHours } from './workload-flow';

describe('CBI flow', () => {
  it('asks every item once, personal first, with the prototype scales', () => {
    expect(CBI_STEPS).toHaveLength(CBI_PERSONAL_ITEMS + CBI_WORK_ITEMS);
    expect(CBI_STEPS.filter(s => s.part === 'p').every(s => s.scale === 'freq')).toBe(true);
    expect(CBI_STEPS.filter(s => s.part === 'w').map(s => s.scale)).toEqual(['degree', 'degree', 'degree', 'freq', 'freq', 'freq', 'freq']);
    expect(new Set(CBI_STEPS.map(s => `${s.part}${s.index}`)).size).toBe(CBI_STEPS.length);
  });

  it('needs an option 0–4 for all 13 items', () => {
    const a = emptyCbi();
    expect(cbiComplete(a)).toBe(false);
    const full = { p: a.p.map(() => 1), w: a.w.map(() => 4) };
    expect(cbiComplete(full)).toBe(true);
    expect(cbiComplete({ ...full, w: [...full.w.slice(1), null] })).toBe(false);
    expect(cbiComplete({ ...full, p: [5, ...full.p.slice(1)] })).toBe(false);
    expect(() => cbiBody(a)).toThrow();
  });

  it('sends option indexes the domain scores as the prototype did', () => {
    const body = cbiBody({ p: [0, 0, 0, 0, 0, 0], w: [0, 0, 0, 0, 0, 0, 4] });
    expect(body).toEqual({ p: [0, 0, 0, 0, 0, 0], w: [0, 0, 0, 0, 0, 0, 4] });
    // 總是 is 100 and the last work item is reversed, so "never enough energy" also counts 100.
    expect(cbiScores(body)).toEqual({ pf: 100, wf: 100 });
  });
});

describe('working hours flow', () => {
  it('takes 0–744 hours', () => {
    expect(validHours(0)).toBe(true);
    expect(validHours(45.5)).toBe(true);
    expect(validHours(744)).toBe(true);
    for (const bad of [-1, 745, '', '12', null, Number.NaN]) expect(validHours(bad), String(bad)).toBe(false);
  });

  it('needs both hours; work patterns may be none', () => {
    expect(overloadComplete({ overtime1m: 10, overtime6mAvg: null, workPatterns: [] })).toBe(false);
    expect(overloadComplete({ overtime1m: 10, overtime6mAvg: 0, workPatterns: [] })).toBe(true);
  });

  it('sends the domain values in the domain order', () => {
    const body = overloadBody({ overtime1m: 50, overtime6mAvg: 30, workPatterns: [WORK_PATTERNS[4], WORK_PATTERNS[2]] });
    expect(body).toEqual({ overtime1m: 50, overtime6mAvg: 30, workPatterns: [WORK_PATTERNS[2], WORK_PATTERNS[4]] });
  });
});
