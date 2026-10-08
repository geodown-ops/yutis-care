/* Payment orders (付款單) in the platform admin: the create form's rules and what a row shows. */
import type { PaymentOrder, Subscription, TenantDetail } from './api';
import { emailProblem, textProblem, withoutEmpty, type Problems } from './forms';
import { PAYMENT_ORDER_STATUS } from './labels';
import { dayAfter, seatLimitProblem, seatLimitValue, termProblem, type SeatLimitInput } from './tenants';

export interface PaymentOrderForm {
  planCode: string;
  seatLimit: SeatLimitInput;
  startsOn: string;
  endsOn: string;
  amount: number | string;
  /** Empty: the API writes plan, period and seats. */
  description: string;
  payerName: string;
  payerEmail: string;
  expiresOn: string;
  sendEmail: boolean;
}

/** Days to pay by default, as the API's default. */
export const DAYS_TO_PAY = 14;
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
const addYear = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;

/**
 * A new order for the period after the latest (a year by default), on the latest plan and seats, payable by the first
 * active tenant admin.
 */
export function paymentOrderToForm(t: Pick<TenantDetail, 'subscriptions' | 'admins'>, today: string): PaymentOrderForm {
  const latest: Subscription | null = t.subscriptions[0] ?? null;
  let startsOn = latest?.endsOn ? dayAfter(latest.endsOn) : today;
  if (latest && startsOn <= latest.startsOn) startsOn = dayAfter(latest.startsOn);
  const payer = t.admins.find(a => a.active) ?? null;
  return {
    planCode: latest?.planCode ?? '', seatLimit: latest?.seatLimit ?? '', startsOn, endsOn: addDays(addYear(startsOn), -1), amount: '',
    description: '', payerName: payer?.name ?? '', payerEmail: payer?.email ?? '', expiresOn: addDays(today, DAYS_TO_PAY), sendEmail: true,
  };
}

export function paymentOrderProblems(f: PaymentOrderForm, latest: Pick<Subscription, 'startsOn'> | null, today: string): Problems<PaymentOrderForm> {
  const amount = f.amount === '' ? NaN : Number(f.amount);
  return withoutEmpty({
    planCode: f.planCode ? undefined : '請選擇方案',
    seatLimit: seatLimitProblem(f.seatLimit),
    startsOn: !f.startsOn ? '請選擇開始日'
      : latest && f.startsOn <= latest.startsOn ? `要晚於最近一期的開始日（${latest.startsOn.replaceAll('-', '/')}）` : undefined,
    endsOn: termProblem(f.startsOn, f.endsOn),
    amount: Number.isInteger(amount) && amount > 0 ? undefined : '請輸入金額（新台幣，整數）',
    description: f.description.trim() ? textProblem(f.description, '項目說明', 80) : undefined,
    payerName: textProblem(f.payerName, '付款聯絡人', 50),
    payerEmail: emailProblem(f.payerEmail),
    expiresOn: !f.expiresOn ? '請選擇付款期限' : f.expiresOn < today ? '付款期限不能早於今天' : undefined,
  });
}

export const paymentOrderBody = (tenantId: string, f: PaymentOrderForm) => ({
  tenantId, planCode: f.planCode, seatLimit: seatLimitValue(f.seatLimit), startsOn: f.startsOn, endsOn: f.endsOn || null, amount: Number(f.amount),
  ...(f.description.trim() ? { description: f.description.trim() } : {}),
  payerName: f.payerName.trim(), payerEmail: f.payerEmail.trim(), expiresOn: f.expiresOn, sendEmail: f.sendEmail,
});

export const formatTwd = (amount: number) => `NT$${amount.toLocaleString('en-US')}`;

export const paymentOrderLabel = (o: Pick<PaymentOrder, 'status' | 'expired'>) => PAYMENT_ORDER_STATUS[o.expired ? 'expired' : o.status];

/** How it was paid, in a few words. */
export function paidWith(o: Pick<PaymentOrder, 'method' | 'cardLastFour' | 'paidNote'>): string {
  if (o.method === 'card') return o.cardLastFour ? `信用卡末四碼 ${o.cardLastFour}` : '信用卡';
  if (o.method === 'transfer') return o.paidNote ? `匯款（${o.paidNote}）` : '匯款';
  return '';
}
