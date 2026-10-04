/*
 * Tenant admin navigation. Pages and role visibility follow the frontend/backend plan
 * (https://claude.ai/code/artifact/bde8e9aa-a55b-47cd-9915-ee20797d0ff3). Hiding a menu item is a
 * convenience only; the API enforces permissions.
 */
import {
  IconAdjustmentsHorizontal, IconArrowsExchange, IconBabyCarriage, IconBuilding, IconChartBar, IconClipboardHeart,
  IconClockExclamation, IconFileImport, IconHeadset, IconHistory, IconLayoutDashboard, IconLogin2, IconShieldCheck,
  IconSitemap, IconStethoscope, IconStretching, IconUserPlus, IconUsers, IconUserShield,
} from '@tabler/icons-react';
import type { StaffRole } from '@yutis/api-client';
import type { ComponentType } from 'react';

export interface NavItem { path: string; label: string; icon: ComponentType<{ size?: number; stroke?: number }>; roles: readonly StaffRole[] }
export interface NavGroup { label: string; items: NavItem[] }

const CARE = ['職護', '職醫'] as const satisfies readonly StaffRole[];
const PROGRAMS = [...CARE, '職安衛人員', '人資', '部門主管'] as const satisfies readonly StaffRole[];

export const NAV: NavGroup[] = [
  { label: '工作台', items: [{ path: '/', label: '職護首頁', icon: IconLayoutDashboard, roles: CARE }] },
  { label: '員工', items: [
    { path: '/employees', label: '員工資料', icon: IconUsers, roles: [...CARE, '人資'] },
    { path: '/cases', label: '個案管理', icon: IconClipboardHeart, roles: CARE },
    { path: '/exams/import', label: '健檢匯入', icon: IconFileImport, roles: CARE },
  ] },
  { label: '職業衛生計畫', items: [
    { path: '/programs/ergo', label: '人因性危害', icon: IconStretching, roles: PROGRAMS },
    { path: '/programs/workload', label: '異常工作負荷', icon: IconClockExclamation, roles: PROGRAMS },
    { path: '/programs/maternal', label: '母性健康保護', icon: IconBabyCarriage, roles: PROGRAMS },
    { path: '/programs/violence', label: '不法侵害預防', icon: IconShieldCheck, roles: PROGRAMS },
    { path: '/service-records', label: '勞工健康服務', icon: IconStethoscope, roles: PROGRAMS },
  ] },
  { label: '分析', items: [{ path: '/reports', label: '統計報表', icon: IconChartBar, roles: [...CARE, '職安衛人員', '人資'] }] },
  { label: '租戶管理', items: [
    { path: '/admin/company', label: '公司資料與品牌', icon: IconBuilding, roles: ['租戶管理員'] },
    { path: '/admin/login', label: '登入設定', icon: IconLogin2, roles: ['租戶管理員'] },
    { path: '/admin/org', label: '組織架構', icon: IconSitemap, roles: ['租戶管理員'] },
    { path: '/admin/employee-import', label: '員工匯入', icon: IconUserPlus, roles: ['租戶管理員'] },
    { path: '/admin/accounts', label: '帳號與權限', icon: IconUserShield, roles: ['租戶管理員'] },
    { path: '/admin/rules', label: '分級標準、片語、簽核角色', icon: IconAdjustmentsHorizontal, roles: ['租戶管理員'] },
    { path: '/admin/exam-mapping', label: '健檢匯入對照', icon: IconArrowsExchange, roles: ['租戶管理員'] },
    { path: '/admin/support-access', label: '客服授權', icon: IconHeadset, roles: ['租戶管理員'] },
    { path: '/admin/audit', label: '稽核查詢', icon: IconHistory, roles: ['租戶管理員'] },
  ] },
];

export const ALL_NAV_ITEMS = NAV.flatMap(g => g.items);

/** The menu as one role sees it; empty groups are dropped. */
export function navFor(role: StaffRole): NavGroup[] {
  return NAV.map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(role)) })).filter(g => g.items.length > 0);
}

/** Roles that may see health data (exam values, case details). */
export const CARE_ROLES: readonly StaffRole[] = CARE;

export function isActivePath(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');
}
