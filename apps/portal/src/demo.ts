/* Demo data until the portal API (/api/portal/*) exists. All people and values are fictional. */
export const DEMO_TENANT_NAME = '示範科技股份有限公司';
export const DEMO_ME = { name: '林志明', givenName: '志明' };

export interface PortalTask { id: string; kind: 'nmq' | 'confirm' | 'cbi'; title: string; detail: string; done: boolean }

export const MY_TASKS: PortalTask[] = [
  { id: 'nmq-2026h2', kind: 'nmq', title: '肌肉骨骼症狀調查', detail: '10/10 截止 · 約 3 分鐘', done: false },
  { id: 'interview-0930', kind: 'confirm', title: '確認面談紀錄', detail: '李醫師 · 09/30 面談', done: false },
  { id: 'cbi-2026', kind: 'cbi', title: '過勞量表', detail: '09/12 已完成', done: true },
];
