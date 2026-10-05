/*
 * Tenant admin navigation. Pages and role visibility follow the frontend/backend plan
 * (https://claude.ai/code/artifact/bde8e9aa-a55b-47cd-9915-ee20797d0ff3). Hiding a menu item is a
 * convenience only; the API enforces permissions.
 */
import {
  IconAddressBook, IconAdjustmentsHorizontal, IconArrowsExchange, IconBabyCarriage, IconBell, IconBuilding, IconChartBar, IconClipboardHeart,
  IconClockExclamation, IconFileImport, IconHistory, IconLayoutDashboard, IconLogin2, IconShieldCheck,
  IconSitemap, IconStethoscope, IconStretching, IconUserPlus, IconUsers, IconUserShield,
} from '@tabler/icons-react';
import type { DataCategory, Feature, StaffMe, StaffRole } from '@yutis/api-client';
import type { ComponentType } from 'react';

/**
 * Who sees a menu item: the role's feature from GET /api/me, plus the data category or roles the API route requires
 * where that is narrower than the feature (permissions.ts and the controllers in apps/api).
 */
export interface Access { feature: Feature; data?: DataCategory; roles?: readonly StaffRole[] }

export interface NavItem { path: string; label: string; icon: ComponentType<{ size?: number; stroke?: number }>; access: Access }
export interface NavGroup { label: string; items: NavItem[] }

const ADMIN: Access = { feature: 'tenant-admin' };

export const NAV: NavGroup[] = [
  { label: '工作台', items: [{ path: '/', label: '職護首頁', icon: IconLayoutDashboard, access: { feature: 'nurse-home' } }] },
  { label: '員工', items: [
    { path: '/employees', label: '員工資料', icon: IconUsers, access: { feature: 'employees', data: 'identity' } },
    { path: '/cases', label: '個案管理', icon: IconClipboardHeart, access: { feature: 'cases', data: 'health' } },
    { path: '/exams/import', label: '健檢匯入', icon: IconFileImport, access: { feature: 'employees', data: 'health' } },
  ] },
  { label: '職業衛生計畫', items: [
    // Managers read the notices sent to them; ergonomics is clinical only; for workload HR gets the work advice.
    { path: '/programs/notices', label: '工作安排通知', icon: IconBell, access: { feature: 'programs', roles: ['部門主管'] } },
    { path: '/programs/ergo', label: '人因性危害', icon: IconStretching, access: { feature: 'programs', data: 'health', roles: ['職護', '職醫'] } },
    { path: '/programs/workload', label: '異常工作負荷', icon: IconClockExclamation, access: { feature: 'programs', roles: ['職護', '職醫', '人資'] } },
    { path: '/programs/maternal', label: '母性健康保護', icon: IconBabyCarriage, access: { feature: 'programs', roles: ['職護', '職醫', '職安衛人員', '人資'] } },
    { path: '/programs/violence', label: '不法侵害預防', icon: IconShieldCheck, access: { feature: 'programs', roles: ['職護', '職醫', '職安衛人員'] } },
    { path: '/service-records', label: '勞工健康服務', icon: IconStethoscope, access: { feature: 'service-records', roles: ['職護', '職醫', '職安衛人員'] } },
  ] },
  { label: '分析', items: [{ path: '/reports', label: '統計報表', icon: IconChartBar, access: { feature: 'reports' } }] },
  { label: '租戶管理', items: [
    { path: '/admin/company', label: '公司資料與品牌', icon: IconBuilding, access: ADMIN },
    { path: '/admin/login', label: '登入設定', icon: IconLogin2, access: ADMIN },
    { path: '/admin/org', label: '組織架構', icon: IconSitemap, access: ADMIN },
    { path: '/admin/employees', label: '員工主檔', icon: IconAddressBook, access: ADMIN },
    { path: '/admin/employee-import', label: '員工匯入', icon: IconUserPlus, access: ADMIN },
    { path: '/admin/accounts', label: '帳號與權限', icon: IconUserShield, access: ADMIN },
    { path: '/admin/rules', label: '分級標準、片語、簽核角色', icon: IconAdjustmentsHorizontal, access: ADMIN },
    { path: '/admin/exam-mapping', label: '健檢匯入對照', icon: IconArrowsExchange, access: ADMIN },
    { path: '/admin/audit', label: '稽核查詢', icon: IconHistory, access: ADMIN },
    // 客服授權 (/admin/support-access) comes back once the tenant API has endpoints for it.
  ] },
];

export const ALL_NAV_ITEMS = NAV.flatMap(g => g.items);

type Who = Pick<StaffMe, 'role' | 'features' | 'dataCategories'>;

export const canAccess = (me: Who, a: Access) =>
  me.features.includes(a.feature) && (!a.data || me.dataCategories.includes(a.data)) && (!a.roles || a.roles.includes(me.role));

/** Exam values, grades and case details: occupational health staff only. HR sees identity and work arrangements. */
export const seesHealth = (me: Who) => me.dataCategories.includes('health');

/** The menu as one person sees it; empty groups are dropped. */
export function navFor(me: Who): NavGroup[] {
  return NAV.map(g => ({ ...g, items: g.items.filter(i => canAccess(me, i.access)) })).filter(g => g.items.length > 0);
}

export function isActivePath(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');
}
