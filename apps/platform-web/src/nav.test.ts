import { describe, expect, it } from 'vitest';
import { menuLink } from './links';
import { ALL_NAV_ITEMS, isActivePath, NAV } from './nav';

describe('platform navigation', () => {
  it('has unique paths', () => {
    const paths = ALL_NAV_ITEMS.map(i => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('lists usage with the customer pages', () => {
    expect(NAV.find(g => g.label === '客戶')?.items.map(i => i.label)).toEqual(['租戶列表', '新增租戶', '用量', '客服存取']);
  });

  it('keeps the tenant list highlighted on a tenant detail page', () => {
    expect(isActivePath('/', '/tenants/8bcf1ce0-8ab3-4b2e-925e-950a2c289344')).toBe(true);
    expect(isActivePath('/', '/tenants/new')).toBe(false);
    expect(isActivePath('/tenants/new', '/tenants/new')).toBe(true);
    expect(isActivePath('/usage', '/usage')).toBe(true);
    expect(isActivePath('/', '/usage')).toBe(false);
  });

  it('links a menu item to its own route, or to the placeholder when it has none', () => {
    const routesByPath = { '/': {}, '/usage': {}, '/$': {} };
    expect(menuLink('/usage', routesByPath)).toEqual({ to: '/usage', params: {} });
    expect(menuLink('/support-access', routesByPath)).toEqual({ to: '/$', params: { _splat: 'support-access' } });
  });
});
