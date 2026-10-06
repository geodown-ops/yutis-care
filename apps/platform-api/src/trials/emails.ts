/* Trial application emails. Plain text; company and contact details only. */
import { TRIAL_EMPLOYEE_RANGE_LABELS, TRIAL_IDENTITY_PROVIDER_LABELS, type TrialEmployeeRange, type TrialIdentityProvider } from '@yutis/domain';
import type { Mail } from '../core/mail.js';

export interface SubmittedApplication {
  id: string;
  companyName: string;
  taxId: string;
  employeeRange: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  preferredSubdomain: string | null;
  identityProvider: string | null;
}

/** To the applicant: we have it, and what happens next. */
export function applicationReceived(a: SubmittedApplication, baseDomain: string): Mail {
  return {
    to: a.email,
    subject: `已收到 ${a.companyName} 的 Yutis Care 試用申請`,
    text: [
      `${a.contactName} 您好：`,
      '',
      `我們已收到 ${a.companyName} 的 Yutis Care 試用申請。審核通過後，系統會寄出開通信到這個信箱，信中有第一次登入的連結。`,
      '',
      '如果這不是您送出的申請，請忽略這封信，或直接回覆讓我們知道。',
      '',
      'Yutis Care',
      `https://${baseDomain}`,
    ].join('\n'),
    idempotencyKey: `trial-received-${a.id}`,
  };
}

/** To platform operations: a new application to review in the platform admin. */
export function applicationToReview(a: SubmittedApplication, to: string, baseDomain: string): Mail {
  const range = TRIAL_EMPLOYEE_RANGE_LABELS[a.employeeRange as TrialEmployeeRange] ?? a.employeeRange;
  const idp = a.identityProvider ? TRIAL_IDENTITY_PROVIDER_LABELS[a.identityProvider as TrialIdentityProvider] ?? a.identityProvider : '未填';
  return {
    to,
    subject: `新的試用申請：${a.companyName}`,
    text: [
      `公司名稱：${a.companyName}`,
      `統一編號：${a.taxId}`,
      `員工人數：${range}`,
      `聯絡人：${a.contactName}（${a.contactTitle}）`,
      `Email：${a.email}`,
      `電話：${a.phone}`,
      `希望的公司代碼：${a.preferredSubdomain ?? '未填'}`,
      `公司帳號系統：${idp}`,
      '',
      `請到平台管理後台審核：https://admin.${baseDomain}/trial-applications`,
    ].join('\n'),
    idempotencyKey: `trial-review-${a.id}-${to}`,
  };
}
