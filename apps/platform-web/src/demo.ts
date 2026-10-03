/* Demo data until the platform API exists. Companies are fictional. Only counts, never employee records. */
export type TenantStatus = '試用' | '啟用' | '暫停' | '解約';

export interface TenantRow {
  id: string; name: string; subdomain: string; status: TenantStatus; plan: string;
  employees: number; seatLimit: number; modules: number; sso: string; lastActive: string;
}

export const TENANTS: TenantRow[] = [
  { id: 't-demo', name: '示範科技股份有限公司', subdomain: 'demo', status: '啟用', plan: '標準版', employees: 412, seatLimit: 500, modules: 5, sso: 'Entra ID', lastActive: '10/03 09:12' },
  { id: 't-hsin', name: '新竹精密工業', subdomain: 'hsinprec', status: '啟用', plan: '進階版', employees: 1_286, seatLimit: 1_500, modules: 5, sso: 'Google', lastActive: '10/03 08:47' },
  { id: 't-nanf', name: '南方食品', subdomain: 'nanfang', status: '試用', plan: '試用', employees: 96, seatLimit: 200, modules: 3, sso: '本地帳號＋MFA', lastActive: '10/02 17:30' },
  { id: 't-tung', name: '東港物流', subdomain: 'tunglog', status: '暫停', plan: '標準版', employees: 233, seatLimit: 300, modules: 2, sso: 'Entra ID', lastActive: '09/18 11:05' },
];

export const STATUS_TONE: Record<TenantStatus, 'ok' | 'info' | 'warn' | 'bad'> = { 啟用: 'ok', 試用: 'info', 暫停: 'warn', 解約: 'bad' };
