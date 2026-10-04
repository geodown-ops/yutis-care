import { DEMO_SITE_SUBDOMAIN, isAvailableTenantSubdomain } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import type { Subscription, Tenant, Usage } from './api';
import {
  currentPeriodIndex, dayAfter, dayBefore, latestPeriodNewEnd, newPeriodProblems, newPeriodToForm,
  emptyNewTenantForm, matchesTenant, newTenantBody, newTenantProblems, pendingSetup, seatUsage, subdomainProblem,
  subscriptionBody, subscriptionProblems, subscriptionToForm, tenantOverview, usageTotals, type NewTenantForm,
} from './tenants';

const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  planCode: 'standard', planName: '標準方案', status: 'active', seatLimit: 100, startsOn: '2026-01-01', endsOn: null, ...over,
});

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: crypto.randomUUID(), subdomain: 'acme', url: 'https://acme.care.yutis.com.tw', name: '示範公司', status: 'active',
  createdAt: '2026-10-01T02:00:00.000Z', subscription: subscription(), activeEmployees: 10, staffAccounts: 2, overSeatLimit: false, ...over,
});

describe('tenant overview', () => {
  it('counts tenants by status, trials and seat overruns from the API rows', () => {
    const o = tenantOverview([
      tenant({ activeEmployees: 120, staffAccounts: 5, overSeatLimit: true }),
      tenant({ subscription: subscription({ status: 'trial' }), activeEmployees: 30, staffAccounts: 1 }),
      tenant({ status: 'suspended', subscription: subscription({ status: 'trial' }), activeEmployees: 50, staffAccounts: 3 }),
      tenant({ status: 'closed', activeEmployees: 999, staffAccounts: 9, overSeatLimit: true }),
      tenant({ subscription: null, activeEmployees: 0, staffAccounts: 0 }),
    ]);
    // The closed tenant counts only as closed: its employees, accounts and overrun are left out.
    expect(o).toEqual({ active: 3, suspended: 1, closed: 1, trial: 1, activeEmployees: 200, staffAccounts: 9, overSeatLimit: 1 });
  });

  it('is all zeros with no tenants', () => {
    expect(tenantOverview([])).toEqual({ active: 0, suspended: 0, closed: 0, trial: 0, activeEmployees: 0, staffAccounts: 0, overSeatLimit: 0 });
  });

  it('sums usage over every tenant', () => {
    const row = (n: number): Usage => ({
      tenantId: crypto.randomUUID(), subdomain: 'a', name: 'A', activeEmployees: n, staffAccounts: 1, examsInMonth: n * 2, smsSent: 3, seatLimit: null, overSeatLimit: false,
    });
    expect(usageTotals([row(10), row(5)])).toEqual({ activeEmployees: 15, staffAccounts: 2, examsInMonth: 30, smsSent: 6 });
  });
});

describe('tenant search', () => {
  it('matches the name or the subdomain, ignoring case and spaces', () => {
    const t = { name: 'Acme 精密', subdomain: 'acme-tw' };
    expect(matchesTenant(t, '')).toBe(true);
    expect(matchesTenant(t, ' 精密 ')).toBe(true);
    expect(matchesTenant(t, 'ACME')).toBe(true);
    expect(matchesTenant(t, 'tw')).toBe(true);
    expect(matchesTenant(t, '南方')).toBe(false);
  });
});

describe('seat usage', () => {
  it('has no bar without a limit', () => {
    expect(seatUsage(40, null)).toEqual({ percent: null, over: false });
  });

  it('caps the bar at 100% and flags going over', () => {
    expect(seatUsage(50, 200)).toEqual({ percent: 25, over: false });
    expect(seatUsage(200, 200)).toEqual({ percent: 100, over: false });
    expect(seatUsage(260, 200)).toEqual({ percent: 100, over: true });
  });
});

describe('pending setup', () => {
  it('lists what onboarding has not created yet', () => {
    expect(pendingSetup({ encryptionKeyReady: true, signInTenantReady: true })).toEqual([]);
    expect(pendingSetup({ encryptionKeyReady: false, signInTenantReady: true })).toEqual(['租戶金鑰（Cloud KMS）尚未建立']);
    expect(pendingSetup({ encryptionKeyReady: false, signInTenantReady: false })).toHaveLength(2);
  });
});

describe('subdomain check', () => {
  it('accepts exactly what the domain lets a new tenant have, and says why the demo site is not', () => {
    const samples = ['acme', 'a', 'a1', 'acme-tw', 'demo', 'demo2', 'x'.repeat(63), 'x'.repeat(64), '', '-acme', 'acme-', 'Acme', 'ac me', 'acme.tw', '台積', 'admin', 'api', 'www', 'www2'];
    for (const s of samples) expect(subdomainProblem(s) === null, s).toBe(isAvailableTenantSubdomain(s));
    expect(subdomainProblem(DEMO_SITE_SUBDOMAIN)).toContain('展示網站');
  });

  it('says what is wrong in Chinese', () => {
    expect(subdomainProblem('')).toBe('請輸入子網域');
    expect(subdomainProblem('admin')).toContain('平台保留');
    expect(subdomainProblem('acme_tw')).toContain('小寫英文字母');
    expect(subdomainProblem('-acme')).toContain('連字號');
    expect(subdomainProblem('x'.repeat(64))).toContain('63');
  });
});

describe('subscription form', () => {
  it('starts from the current subscription, or a trial from today', () => {
    expect(subscriptionToForm(subscription({ endsOn: '2026-12-31' }), '2026-10-04'))
      .toEqual({ planCode: 'standard', status: 'active', seatLimit: 100, startsOn: '2026-01-01', endsOn: '2026-12-31' });
    expect(subscriptionToForm(null, '2026-10-04')).toEqual({ planCode: '', status: 'trial', seatLimit: '', startsOn: '2026-10-04', endsOn: '' });
  });

  it('sends empty seat limit and end date as null', () => {
    expect(subscriptionBody({ planCode: 'standard', status: 'past_due', seatLimit: '', startsOn: '2026-10-01', endsOn: '' }))
      .toEqual({ planCode: 'standard', status: 'past_due', seatLimit: null, startsOn: '2026-10-01', endsOn: null });
  });

  it('checks the plan, a positive whole seat limit and the term order', () => {
    expect(subscriptionProblems({ planCode: 'standard', status: 'active', seatLimit: 300, startsOn: '2026-10-01', endsOn: '2026-10-01' })).toEqual({});
    expect(Object.keys(subscriptionProblems({ planCode: '', status: 'active', seatLimit: 0, startsOn: '', endsOn: '' })).sort())
      .toEqual(['planCode', 'seatLimit', 'startsOn']);
    expect(subscriptionProblems({ planCode: 'standard', status: 'active', seatLimit: 2.5, startsOn: '2026-10-01', endsOn: '2026-09-30' }))
      .toEqual({ seatLimit: expect.any(String), endsOn: '結束日不能早於開始日' });
  });
});

describe('new tenant form', () => {
  const filled: NewTenantForm = {
    ...emptyNewTenantForm('2026-10-04'), name: ' 北辰精密 ', subdomain: ' BeiChen ', planCode: 'standard', seatLimit: 500,
    adminName: ' 林經理 ', adminEmail: ' Lin@BeiChen.example ',
  };

  it('has no problems once filled in', () => {
    expect(newTenantProblems(filled)).toEqual({});
  });

  it('flags every missing required field on an empty form', () => {
    expect(Object.keys(newTenantProblems(emptyNewTenantForm('2026-10-04'))).sort()).toEqual(['adminEmail', 'adminName', 'name', 'planCode', 'subdomain']);
  });

  it('checks the subdomain as the API will see it, and the admin email', () => {
    expect(newTenantProblems({ ...filled, subdomain: ' WWW ' }).subdomain).toContain('平台保留');
    expect(newTenantProblems({ ...filled, adminEmail: 'lin@' }).adminEmail).toBe('Email 格式不正確');
    expect(newTenantProblems({ ...filled, name: 'x'.repeat(101) }).name).toBe('公司名稱最多 100 字');
  });

  it('builds the onboarding body the API expects', () => {
    expect(newTenantBody(filled)).toEqual({
      name: '北辰精密', subdomain: 'beichen', planCode: 'standard', subscriptionStatus: 'trial', seatLimit: 500,
      startsOn: '2026-10-04', endsOn: null, admin: { name: '林經理', email: 'lin@beichen.example' },
    });
  });
});

describe('subscription periods', () => {
  it('steps dates across month and year ends', () => {
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
    expect(dayBefore('2027-03-01')).toBe('2027-02-28');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
  });

  it('marks the current period as the API does: the newest that has started, else the earliest', () => {
    const history = [subscription({ startsOn: '2027-01-01' }), subscription({ startsOn: '2026-01-01' }), subscription({ startsOn: '2025-01-01' })];
    expect(currentPeriodIndex(history, '2026-10-04')).toBe(1);
    expect(currentPeriodIndex(history, '2027-01-01')).toBe(0);
    expect(currentPeriodIndex([subscription({ startsOn: '2026-11-01' })], '2026-10-04')).toBe(0);
    expect(currentPeriodIndex([], '2026-10-04')).toBe(-1);
  });

  it('proposes a renewal starting the day after the latest period ends, on the same plan and seats', () => {
    expect(newPeriodToForm(subscription({ planCode: 'pro', seatLimit: 300, status: 'trial', endsOn: '2026-12-31' }), '2026-10-04'))
      .toEqual({ planCode: 'pro', status: 'active', seatLimit: 300, startsOn: '2027-01-01', endsOn: '' });
    // Open-ended: from today; never on or before the latest period's start.
    expect(newPeriodToForm(subscription({ endsOn: null, seatLimit: null }), '2026-10-04')).toMatchObject({ startsOn: '2026-10-04', seatLimit: '' });
    expect(newPeriodToForm(subscription({ startsOn: '2026-11-01', endsOn: null }), '2026-10-04').startsOn).toBe('2026-11-02');
    expect(newPeriodToForm(null, '2026-10-04')).toEqual({ planCode: '', status: 'active', seatLimit: '', startsOn: '2026-10-04', endsOn: '' });
  });

  it('refuses a period that does not start after the latest one, or a plan no longer offered', () => {
    const latest = subscription({ startsOn: '2026-01-01' });
    const form = newPeriodToForm(latest, '2026-10-04');
    expect(newPeriodProblems(form, latest, ['standard'])).toEqual({});
    expect(newPeriodProblems({ ...form, startsOn: '2026-01-01' }, latest, null).startsOn).toBe('要晚於最近一期的開始日（2026/01/01）');
    expect(newPeriodProblems({ ...form, planCode: 'legacy' }, latest, ['standard']).planCode).toBe('這個方案已停用，請選擇其他方案');
    // Plans not loaded yet: the API still checks.
    expect(newPeriodProblems({ ...form, planCode: 'legacy' }, latest, null)).toEqual({});
    expect(newPeriodProblems({ ...form, startsOn: '' }, latest, ['standard']).startsOn).toBeTruthy();
  });

  it('says where the latest period will end once the new one starts', () => {
    expect(latestPeriodNewEnd(subscription({ startsOn: '2026-01-01', endsOn: null }), '2026-11-01')).toBe('2026-10-31');
    expect(latestPeriodNewEnd(subscription({ startsOn: '2026-01-01', endsOn: '2026-12-31' }), '2026-11-01')).toBe('2026-10-31');
    expect(latestPeriodNewEnd(subscription({ startsOn: '2026-01-01', endsOn: '2026-12-31' }), '2027-01-01')).toBeNull();
    expect(latestPeriodNewEnd(subscription({ startsOn: '2026-01-01' }), '2026-01-01')).toBeNull();
    expect(latestPeriodNewEnd(null, '2026-11-01')).toBeNull();
  });
});
