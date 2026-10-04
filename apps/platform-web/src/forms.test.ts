import { describe, expect, it } from 'vitest';
import { newPlanProblems, planProblems, planUpdate } from './forms';

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

describe('new plans', () => {
  it('needs a new lower-case code and a name', () => {
    expect(newPlanProblems({ code: 'pro-2027', name: '專業方案' }, ['standard'])).toEqual({});
    expect(newPlanProblems({ code: '', name: '專業方案' }, []).code).toBe('請輸入方案代碼');
    expect(newPlanProblems({ code: 'Pro 2027', name: '專業方案' }, []).code).toMatch(/小寫/);
    expect(newPlanProblems({ code: 'x'.repeat(41), name: '專業方案' }, []).code).toMatch(/40/);
    expect(newPlanProblems({ code: 'standard', name: '標準' }, ['standard']).code).toBe('已有這個代碼的方案');
    expect(newPlanProblems({ code: 'pro', name: ' ' }, []).name).toBeTruthy();
  });
});
