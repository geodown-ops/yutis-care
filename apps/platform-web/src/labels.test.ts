import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_KIND, PLATFORM_ROLE_SUMMARY, PLATFORM_ROLES, SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUSES, TEMPLATE_KIND, TENANT_STATUS } from './labels';

describe('status labels', () => {
  it('names every tenant status the API returns', () => {
    expect(Object.fromEntries(Object.entries(TENANT_STATUS).map(([k, v]) => [k, v.label]))).toEqual({ active: '啟用', suspended: '停用', closed: '已關閉' });
  });

  it('names every subscription status, in picker order', () => {
    expect(SUBSCRIPTION_STATUSES.map(s => SUBSCRIPTION_STATUS[s].label)).toEqual(['試用', '正式', '逾期未付', '已取消']);
  });

  it('flags what needs attention', () => {
    expect(TENANT_STATUS.suspended.tone).toBe('warn');
    expect(SUBSCRIPTION_STATUS.past_due.tone).toBe('bad');
    expect(ANNOUNCEMENT_KIND.maintenance.tone).toBe('warn');
  });

  it('has Chinese names for announcement and template kinds and a summary for each platform role', () => {
    for (const l of [...Object.values(ANNOUNCEMENT_KIND), ...Object.values(TEMPLATE_KIND)]) expect(l.label).toMatch(/\p{Script=Han}/u);
    expect(PLATFORM_ROLES.every(r => PLATFORM_ROLE_SUMMARY[r])).toBe(true);
  });
});
