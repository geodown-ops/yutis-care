import { STAFF_ROLES } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, isActivePath, navFor } from './nav';

describe('tenant admin navigation', () => {
  it('has unique paths', () => {
    const paths = ALL_NAV_ITEMS.map(i => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every role at least one page', () => {
    for (const r of STAFF_ROLES) expect(navFor(r).length, r).toBeGreaterThan(0);
  });

  it('shows tenant settings only to the tenant admin', () => {
    expect(navFor('職護').map(g => g.label)).not.toContain('租戶管理');
    expect(navFor('租戶管理員').map(g => g.label)).toEqual(['租戶管理']);
  });

  it('keeps the case list away from HR and managers', () => {
    for (const r of ['人資', '部門主管'] as const) {
      expect(navFor(r).flatMap(g => g.items).map(i => i.path)).not.toContain('/cases');
    }
  });

  it('matches nested paths to their menu item', () => {
    expect(isActivePath('/employees', '/employees/E10234')).toBe(true);
    expect(isActivePath('/', '/employees')).toBe(false);
  });
});
