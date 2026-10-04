import { describe, expect, it } from 'vitest';
import { AUDIT_PAGE_SIZE, auditActionLabel, auditQueryParams, auditSummary, emptyAuditFilters } from './audit';

const entry = (action: string, detail: Record<string, unknown> | null, subjectId: string | null = null) => ({ action, detail, subjectId });

describe('audit log query', () => {
  it('leaves empty filters out and pages by the page size', () => {
    expect(auditQueryParams(emptyAuditFilters(), 0)).toEqual({ limit: AUDIT_PAGE_SIZE, offset: 0 });
    expect(auditQueryParams({ ...emptyAuditFilters(), tenantId: 't1', action: 'tenant.suspend', from: '2026-10-01' }, 2))
      .toEqual({ tenantId: 't1', action: 'tenant.suspend', from: '2026-10-01', limit: AUDIT_PAGE_SIZE, offset: 2 * AUDIT_PAGE_SIZE });
  });

  it('swaps dates entered the wrong way round', () => {
    const q = auditQueryParams({ ...emptyAuditFilters(), actorId: 'u1', from: '2026-10-04', to: '2026-09-01' }, 0);
    expect(q).toMatchObject({ actorId: 'u1', from: '2026-09-01', to: '2026-10-04' });
  });
});

describe('audit log lines', () => {
  it('names known actions and shows unknown ones as recorded', () => {
    expect(auditActionLabel('subscription.renew')).toBe('新增訂閱期間');
    expect(auditActionLabel('something.new')).toBe('something.new');
  });

  it('summarises onboarding and subscription changes', () => {
    expect(auditSummary(entry('tenant.onboard', { subdomain: 'acme', name: 'Acme', plan: 'standard', subscriptionStatus: 'trial', seatLimit: null })))
      .toBe('子網域 acme，方案 standard，試用，人數不限');
    expect(auditSummary(entry('subscription.renew', {
      planCode: 'pro', status: 'active', seatLimit: 300, startsOn: '2027-01-01', endsOn: null, previousEndsOn: '2026-12-31',
    }))).toBe('方案 pro，正式，上限 300 人，2027/01/01 起，前一期改至 2026/12/31 結束');
    expect(auditSummary(entry('subscription.set', { planCode: 'pro', status: 'active', seatLimit: 50, startsOn: '2026-01-01', endsOn: '2026-12-31' })))
      .toBe('方案 pro，正式，上限 50 人，2026/01/01 起至 2026/12/31');
  });

  it('names the plan or person changed when the page knows them', () => {
    const names = { plans: new Map([['p1', '標準方案']]), users: new Map([['u1', '王小明']]) };
    expect(auditSummary(entry('plan.update', { active: false }, 'p1'), names)).toBe('標準方案，停用');
    expect(auditSummary(entry('plan.update', { name: '標準方案 2027' }, 'p9'), names)).toBe('名稱改為「標準方案 2027」');
    expect(auditSummary(entry('platform_user.update', { role: '工程', active: true }, 'u1'), names)).toBe('王小明，角色改為工程，啟用');
    // Without the users list (only engineering may read it), the change still reads.
    expect(auditSummary(entry('platform_user.update', { active: false }, 'u1'))).toBe('停用');
  });

  it('reads announcements, templates and suspensions', () => {
    expect(auditSummary(entry('announcement.update', { fields: ['title', 'publishAt', 'other'] }))).toBe('修改標題、發布時間、other');
    expect(auditSummary(entry('announcement.delete', { title: '系統維護' }))).toBe('「系統維護」');
    expect(auditSummary(entry('templates.sync', { published: ['nmq v3', 'cbi v2'] }))).toBe('發布 nmq v3、cbi v2');
    expect(auditSummary(entry('templates.sync', { published: [] }))).toBe('沒有新版本');
    expect(auditSummary(entry('tenant.suspend', { reason: '  逾期未付款 ' }))).toBe('原因：逾期未付款');
    expect(auditSummary(entry('tenant.reactivate', null))).toBe('');
  });

  it('lists the plain values of an action it does not know', () => {
    expect(auditSummary(entry('x.y', { a: 1, b: 'two', c: { nested: true } }))).toBe('a: 1，b: two');
  });
});
