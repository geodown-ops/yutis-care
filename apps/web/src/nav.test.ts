import { STAFF_ROLES, type StaffMe, type StaffRole } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, isActivePath, navFor, seesHealth } from './nav';

/** What GET /api/me returns per role (ROLE_ACCESS in apps/api/src/auth/permissions.ts). */
const CLINICAL = { dataCategories: ['identity', 'work', 'health', 'medical'], features: ['nurse-home', 'employees', 'cases', 'programs', 'service-records', 'reports'] } as const;
const ACCESS: Record<StaffRole, Pick<StaffMe, 'dataCategories' | 'features'>> = {
  職護: { ...CLINICAL, dataCategories: [...CLINICAL.dataCategories], features: [...CLINICAL.features] },
  職醫: { ...CLINICAL, dataCategories: [...CLINICAL.dataCategories], features: [...CLINICAL.features] },
  職安衛人員: { dataCategories: ['identity', 'work'], features: ['programs', 'service-records', 'reports'] },
  人資: { dataCategories: ['identity', 'work'], features: ['employees', 'programs', 'service-records', 'reports'] },
  部門主管: { dataCategories: ['identity', 'work'], features: ['programs', 'service-records'] },
  租戶管理員: { dataCategories: ['identity'], features: ['tenant-admin'] },
};
const as = (role: StaffRole) => ({ role, ...ACCESS[role] });
const paths = (role: StaffRole) => navFor(as(role)).flatMap(g => g.items).map(i => i.path);

describe('tenant admin navigation', () => {
  it('has unique paths', () => {
    const all = ALL_NAV_ITEMS.map(i => i.path);
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every role at least one page', () => {
    for (const r of STAFF_ROLES) expect(navFor(as(r)).length, r).toBeGreaterThan(0);
  });

  it('shows tenant settings only to the tenant admin', () => {
    expect(navFor(as('職護')).map(g => g.label)).not.toContain('租戶管理');
    expect(navFor(as('租戶管理員')).map(g => g.label)).toEqual(['租戶管理']);
  });

  it('keeps cases and exam import away from HR and managers', () => {
    for (const r of ['人資', '部門主管', '職安衛人員'] as const) {
      expect(paths(r)).not.toContain('/cases');
      expect(paths(r)).not.toContain('/exams/import');
    }
    expect(paths('人資')).toContain('/employees');
  });

  it('offers the service record form only to the roles that may fill it in', () => {
    expect(paths('職安衛人員')).toContain('/service-records');
    expect(paths('人資')).not.toContain('/service-records');
  });

  it('shows the maternal and violence programmes to the roles their API routes allow', () => {
    for (const r of ['職護', '職醫', '職安衛人員'] as const) expect(paths(r)).toEqual(expect.arrayContaining(['/programs/maternal', '/programs/violence']));
    expect(paths('人資')).toContain('/programs/maternal');
    expect(paths('人資')).not.toContain('/programs/violence');
    expect(paths('部門主管')).not.toContain('/programs/maternal');
    expect(paths('部門主管')).not.toContain('/programs/violence');
  });

  it('gives the work-arrangement inbox to managers only', () => {
    expect(STAFF_ROLES.filter(r => paths(r).includes('/programs/notices'))).toEqual(['部門主管']);
  });

  it('shows health data to occupational health staff only', () => {
    expect(STAFF_ROLES.filter(r => seesHealth(as(r)))).toEqual(['職護', '職醫']);
  });

  it('matches nested paths to their menu item', () => {
    expect(isActivePath('/employees', '/employees/E10234')).toBe(true);
    expect(isActivePath('/', '/employees')).toBe(false);
  });
});
