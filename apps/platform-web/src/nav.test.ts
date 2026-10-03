import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, isActivePath } from './nav';

describe('platform navigation', () => {
  it('has unique paths', () => {
    const paths = ALL_NAV_ITEMS.map(i => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps the tenant list highlighted on a tenant detail page', () => {
    expect(isActivePath('/', '/tenants/t-demo')).toBe(true);
    expect(isActivePath('/', '/tenants/new')).toBe(false);
    expect(isActivePath('/tenants/new', '/tenants/new')).toBe(true);
  });
});
