import { describe, expect, it } from 'vitest';
import type { Permission } from './api';
import { NAV } from './nav';
import { can, visibleNav } from './permissions';

// As apps/platform-api/src/auth/permissions.ts grants them.
const OPS: Permission[] = ['tenants:read', 'tenants:write', 'subscriptions:write', 'announcements:write', 'templates:write', 'audit:read'];
const SUPPORT: Permission[] = ['tenants:read', 'announcements:write', 'audit:read'];
const ENGINEERING: Permission[] = ['tenants:read', 'templates:write', 'platform-users:manage', 'audit:read'];

const labels = (permissions: Permission[]) => visibleNav(NAV, { permissions }).flatMap(g => g.items.map(i => i.label));

describe('platform role permissions', () => {
  it('allows only what the role was given, and nothing before the role is known', () => {
    expect(can({ permissions: OPS }, 'subscriptions:write')).toBe(true);
    expect(can({ permissions: SUPPORT }, 'subscriptions:write')).toBe(false);
    expect(can(null, 'tenants:read')).toBe(false);
    expect(can(undefined, 'tenants:read')).toBe(false);
  });

  it('shows 新增租戶 only to roles that may onboard tenants', () => {
    expect(labels(OPS)).toContain('新增租戶');
    expect(labels(SUPPORT)).not.toContain('新增租戶');
    expect(labels(ENGINEERING)).not.toContain('新增租戶');
    expect(labels(SUPPORT)).toEqual(expect.arrayContaining(['租戶列表', '用量', '預設範本', '系統公告', '平台帳號與稽核']));
  });

  it('drops groups left without items', () => {
    const nav: { label: string; items: { path: string; permission?: Permission }[] }[] = [
      { label: 'a', items: [{ path: '/x', permission: 'platform-users:manage' }] },
      { label: 'b', items: [{ path: '/y' }] },
    ];
    expect(visibleNav(nav, { permissions: OPS }).map(g => g.label)).toEqual(['b']);
    expect(visibleNav(nav, { permissions: ENGINEERING }).map(g => g.label)).toEqual(['a', 'b']);
  });
});
