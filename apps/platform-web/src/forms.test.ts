import { describe, expect, it } from 'vitest';
import { planProblems, planUpdate } from './forms';

describe('plan editing', () => {
  const plan = { name: '標準方案', active: true };

  it('sends only what changed, and nothing when nothing did', () => {
    expect(planUpdate(plan, { name: '標準方案', active: true })).toBeNull();
    expect(planUpdate(plan, { name: '  標準方案 ', active: true })).toBeNull();
    expect(planUpdate(plan, { name: '標準方案', active: false })).toEqual({ active: false });
    expect(planUpdate(plan, { name: ' 標準方案 2027 ', active: true })).toEqual({ name: '標準方案 2027' });
    expect(planUpdate(plan, { name: '進階', active: false })).toEqual({ name: '進階', active: false });
  });

  it('needs a name', () => {
    expect(planProblems({ name: '  ', active: true }).name).toBeTruthy();
    expect(planProblems({ name: '標準方案', active: false })).toEqual({});
    expect(planProblems({ name: 'x'.repeat(101), active: true }).name).toBeTruthy();
  });
});
