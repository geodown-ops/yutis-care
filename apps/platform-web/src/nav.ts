/* Platform admin navigation (frontend/backend plan, 平台管理後台). It manages customers, never employees. */
export const NAV = [
  { label: '客戶', items: [
    { path: '/', label: '租戶列表' },
    { path: '/tenants/new', label: '新增租戶' },
    { path: '/support-access', label: '客服存取' },
  ] },
  { label: '平台', items: [
    { path: '/templates', label: '預設範本' },
    { path: '/announcements', label: '系統公告' },
    { path: '/platform-users', label: '平台帳號與稽核' },
  ] },
];
export const ALL_NAV_ITEMS = NAV.flatMap(g => g.items);
export const isActivePath = (path: string, pathname: string) =>
  path === '/' ? pathname === '/' || (pathname.startsWith('/tenants/') && pathname !== '/tenants/new') : pathname === path || pathname.startsWith(path + '/');
