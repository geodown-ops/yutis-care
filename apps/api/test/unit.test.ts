import { describe, expect, it } from 'vitest';
import { allows } from '../src/auth/access.guard.js';
import { ROLE_ACCESS } from '../src/auth/permissions.js';
import { loadConfig } from '../src/config.js';
import type { StaffPrincipal } from '../src/core/context.js';
import { tenantSlugFromHost } from '../src/core/host.js';

describe('tenantSlugFromHost', () => {
  const base = 'care.yutis.com.tw';

  it('takes the single label in front of the product domain', () => {
    expect(tenantSlugFromHost('acme.care.yutis.com.tw', base)).toBe('acme');
    expect(tenantSlugFromHost('ACME.Care.Yutis.com.tw:443', base)).toBe('acme');
    expect(tenantSlugFromHost('acme-2.care.yutis.com.tw.', base)).toBe('acme-2');
  });

  it.each([
    'care.yutis.com.tw', 'admin.care.yutis.com.tw', 'api.care.yutis.com.tw', 'www.care.yutis.com.tw',
    'a.b.care.yutis.com.tw', 'acme.yutis.com.tw', 'acmecare.yutis.com.tw', '-acme.care.yutis.com.tw', '', 'localhost',
  ])('rejects %s', host => {
    expect(tenantSlugFromHost(host, base)).toBeNull();
  });
});

describe('role access', () => {
  const as = (role: StaffPrincipal['role']): StaffPrincipal => ({ kind: 'staff', sessionId: 's', userId: 'u', name: 'n', email: 'e', role });

  it('keeps health and medical data with occupational health staff', () => {
    for (const role of ['職醫', '職護'] as const) expect(allows({ kind: 'staff', data: 'medical' }, as(role))).toBe(true);
    for (const role of ['職安衛人員', '人資', '部門主管', '租戶管理員'] as const) {
      expect(allows({ kind: 'staff', data: 'health' }, as(role))).toBe(false);
      expect(allows({ kind: 'staff', data: 'medical' }, as(role))).toBe(false);
    }
  });

  it('gives tenant administration only to tenant admins', () => {
    const admins = Object.entries(ROLE_ACCESS).filter(([, a]) => a.features.includes('tenant-admin')).map(([r]) => r);
    expect(admins).toEqual(['租戶管理員']);
  });

  it('never lets an employee into staff routes', () => {
    expect(allows({ kind: 'staff' }, { kind: 'employee', sessionId: 's', employeeId: 'e', name: 'n', lang: 'zh' })).toBe(false);
  });
});

describe('loadConfig', () => {
  const env = { APP_DATABASE_URL: 'postgres://x/y' };

  it('defaults to secure production settings', () => {
    expect(loadConfig(env)).toMatchObject({ cookieSecure: true, devSignIn: false, tenantBaseDomain: 'care.yutis.com.tw', sessionIdleSeconds: 900 });
  });

  it('refuses dev sign-in or insecure cookies in production', () => {
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', AUTH_DEV_SIGN_IN: 'true' })).toThrow(/AUTH_DEV_SIGN_IN/);
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({})).toThrow(/APP_DATABASE_URL/);
  });
});
