/*
 * One-click accounts for the demo tenant (subdomain `demo`, dev sign-in only), replacing the old role switcher. They
 * are the fictional people created by apps/api/scripts/seed-dev.ts (staff) and the prototype demo data (employees).
 */
export interface DemoAccount { token: string; name: string; label: string }

export const DEMO_STAFF: DemoAccount[] = [
  { token: 'nurse@demo.test', name: '王護理師', label: '職護' },
  { token: 'doctor@demo.test', name: '張醫師', label: '職醫' },
  { token: 'safety@demo.test', name: '吳工安', label: '職安衛人員' },
  { token: 'hr@demo.test', name: '李人資', label: '人資' },
  { token: 'manager@demo.test', name: '周課長', label: '部門主管' },
  { token: 'admin@demo.test', name: '陳管理員', label: '租戶管理員' },
];

export const DEMO_EMPLOYEES: DemoAccount[] = [
  { token: 'yc0002@example.com', name: '林志豪', label: 'E10244' },
  { token: 'e001@demo.test', name: '林小美', label: 'E001' },
];
