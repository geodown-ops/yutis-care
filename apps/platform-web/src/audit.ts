/*
 * The platform audit log (GET /platform-api/audit): what each recorded action means, and one line on what changed,
 * read from the entry's `detail` as each platform API controller writes it (recordPlatformAudit).
 */
import type { AuditEntry, AuditFilters } from './api';
import { formatDate } from './format';
import { SUBSCRIPTION_STATUS } from './labels';

export const AUDIT_ACTIONS: Record<string, string> = {
  'tenant.onboard': '開通租戶',
  'tenant.suspend': '停用租戶',
  'tenant.reactivate': '恢復啟用租戶',
  'subscription.renew': '新增訂閱期間',
  'subscription.set': '更正目前訂閱',
  'plan.create': '新增方案',
  'plan.update': '修改方案',
  'announcement.create': '發布公告',
  'announcement.update': '修改公告',
  'announcement.delete': '刪除公告',
  'templates.sync': '更新預設範本',
  'platform_user.create': '新增平台人員',
  'platform_user.update': '修改平台人員',
};

export const auditActionLabel = (action: string) => AUDIT_ACTIONS[action] ?? action;

/** Page size of the log; the API allows up to 200. */
export const AUDIT_PAGE_SIZE = 50;

/** The log's filters as the form holds them; '' means any. Dates are YYYY-MM-DD in Taiwan time. */
export interface AuditFilterForm { tenantId: string; actorId: string; action: string; from: string; to: string }

export const emptyAuditFilters = (): AuditFilterForm => ({ tenantId: '', actorId: '', action: '', from: '', to: '' });

/** The API query for a page; empty filters are left out. Dates in the wrong order are swapped, as people mean them. */
export function auditQueryParams(f: AuditFilterForm, page: number): AuditFilters {
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return {
    ...(f.tenantId ? { tenantId: f.tenantId } : {}),
    ...(f.actorId ? { actorId: f.actorId } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    limit: AUDIT_PAGE_SIZE,
    offset: page * AUDIT_PAGE_SIZE,
  };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const join = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join('，');

const seats = (v: unknown) => {
  if (v === null) return '人數不限';
  const n = num(v);
  return n == null ? null : `上限 ${n.toLocaleString('zh-TW')} 人`;
};
const status = (v: unknown) => {
  const s = str(v);
  return s && s in SUBSCRIPTION_STATUS ? SUBSCRIPTION_STATUS[s as keyof typeof SUBSCRIPTION_STATUS].label : s;
};
const term = (from: unknown, to: unknown) => {
  const start = str(from);
  if (!start) return null;
  const end = str(to);
  return `${formatDate(start)} 起${end ? `至 ${formatDate(end)}` : ''}`;
};

const ANNOUNCEMENT_FIELDS: Record<string, string> = {
  tenantId: '對象', kind: '類型', title: '標題', body: '內容', publishAt: '發布時間', expiresAt: '下架時間',
};

/** Names the log itself does not carry: plans and platform users, by id. */
export interface AuditNames { plans?: ReadonlyMap<string, string>; users?: ReadonlyMap<string, string> }

/** One line on what changed, in plain Chinese; '' when the entry says nothing more than its action. */
export function auditSummary(e: Pick<AuditEntry, 'action' | 'detail' | 'subjectId'>, names: AuditNames = {}): string {
  const d = e.detail ?? {};
  const subject = (map?: ReadonlyMap<string, string>) => (e.subjectId && map?.get(e.subjectId)) || null;
  switch (e.action) {
    case 'tenant.onboard':
      return join([str(d.subdomain) && `子網域 ${str(d.subdomain)}`, str(d.plan) && `方案 ${str(d.plan)}`, status(d.subscriptionStatus), seats(d.seatLimit)]);
    case 'tenant.suspend':
      return str(d.reason) ? `原因：${str(d.reason)}` : '';
    case 'subscription.set':
    case 'subscription.renew':
      return join([
        str(d.planCode) && `方案 ${str(d.planCode)}`, status(d.status), seats(d.seatLimit), term(d.startsOn, d.endsOn),
        str(d.previousEndsOn) && `前一期改至 ${formatDate(str(d.previousEndsOn))} 結束`,
      ]);
    case 'plan.create':
      return join([str(d.code), str(d.name)]);
    case 'plan.update':
      return join([
        !str(d.name) && subject(names.plans), str(d.name) && `名稱改為「${str(d.name)}」`,
        d.active === false && '停用', d.active === true && '重新啟用', 'pricing' in d && '計價參數',
      ]);
    case 'announcement.create':
    case 'announcement.delete':
      return str(d.title) ? `「${str(d.title)}」` : '';
    case 'announcement.update': {
      const fields = list(d.fields).map(f => ANNOUNCEMENT_FIELDS[f] ?? f);
      return fields.length ? `修改${fields.join('、')}` : '';
    }
    case 'templates.sync': {
      const published = list(d.published);
      return published.length ? `發布 ${published.join('、')}` : '沒有新版本';
    }
    case 'platform_user.create':
      return join([str(d.email), str(d.role)]);
    case 'platform_user.update':
      return join([
        subject(names.users), str(d.name) && `姓名改為「${str(d.name)}」`, str(d.role) && `角色改為${str(d.role)}`,
        d.active === false && '停用', d.active === true && '啟用',
      ]);
    default:
      return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? [`${k}: ${v}`] : [])).join('，');
  }
}
