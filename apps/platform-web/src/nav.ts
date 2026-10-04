/* Platform admin navigation (frontend/backend plan, 平台管理後台). It manages customers, never employees. */
import { IconBuildingCommunity, IconChartBar, IconHeadset, IconPlus, IconSpeakerphone, IconTemplate, IconUserShield } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import type { Permission } from './api';

export interface NavItem {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
  /** Shown only to roles with this permission. */
  permission?: Permission;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: '客戶', items: [
    { path: '/', label: '租戶列表', icon: IconBuildingCommunity },
    { path: '/tenants/new', label: '新增租戶', icon: IconPlus, permission: 'tenants:write' },
    { path: '/usage', label: '用量', icon: IconChartBar },
    { path: '/support-access', label: '客服存取', icon: IconHeadset },
  ] },
  { label: '平台', items: [
    { path: '/templates', label: '預設範本', icon: IconTemplate },
    { path: '/announcements', label: '系統公告', icon: IconSpeakerphone },
    { path: '/platform-users', label: '平台帳號與稽核', icon: IconUserShield },
  ] },
];
export const ALL_NAV_ITEMS = NAV.flatMap(g => g.items);
export const isActivePath = (path: string, pathname: string) =>
  path === '/' ? pathname === '/' || (pathname.startsWith('/tenants/') && pathname !== '/tenants/new') : pathname === path || pathname.startsWith(path + '/');
