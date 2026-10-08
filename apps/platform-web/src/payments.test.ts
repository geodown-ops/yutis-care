import { describe, expect, it } from 'vitest';
import type { Subscription, TenantDetail } from './api';
import { paidWith, paymentOrderBody, paymentOrderLabel, paymentOrderProblems, paymentOrderToForm, type PaymentOrderForm } from './payments';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  planCode: 'standard', planName: '標準方案', status: 'trial', seatLimit: 100, startsOn: '2026-10-01', endsOn: '2026-10-30', ...over,
});
const admins: TenantDetail['admins'] = [
  { name: '離職', email: 'old@acme.test', active: false, lastSignInAt: null },
  { name: '陳管理員', email: 'admin@acme.test', active: true, lastSignInAt: null },
];

describe('payment order form', () => {
  it('starts after the latest period, for a year, payable by the first active admin', () => {
    expect(paymentOrderToForm({ subscriptions: [sub()], admins }, '2026-10-08')).toEqual({
      planCode: 'standard', seatLimit: 100, startsOn: '2026-10-31', endsOn: '2027-10-30', amount: '', description: '',
      payerName: '陳管理員', payerEmail: 'admin@acme.test', expiresOn: '2026-10-22', sendEmail: true,
    });
    // An open-ended trial: the paid period starts the day after it began at the earliest.
    expect(paymentOrderToForm({ subscriptions: [sub({ startsOn: '2026-10-08', endsOn: null })], admins: [] }, '2026-10-08'))
      .toMatchObject({ startsOn: '2026-10-09', endsOn: '2027-10-08', payerName: '', payerEmail: '' });
  });

  it('checks what the API checks', () => {
    const form: PaymentOrderForm = { ...paymentOrderToForm({ subscriptions: [sub()], admins }, '2026-10-08'), amount: '36000' };
    expect(paymentOrderProblems(form, sub(), '2026-10-08')).toEqual({});
    expect(paymentOrderProblems({ ...form, amount: '12.5', startsOn: '2026-10-01', payerEmail: 'x', expiresOn: '2026-10-01' }, sub(), '2026-10-08')).toEqual({
      amount: '請輸入金額（新台幣，整數）', startsOn: '要晚於最近一期的開始日（2026/10/01）', payerEmail: 'Email 格式不正確', expiresOn: '付款期限不能早於今天',
    });
    expect(paymentOrderBody('t1', { ...form, seatLimit: '', endsOn: '', description: '  ' })).toEqual({
      tenantId: 't1', planCode: 'standard', seatLimit: null, startsOn: '2026-10-31', endsOn: null, amount: 36000,
      payerName: '陳管理員', payerEmail: 'admin@acme.test', expiresOn: '2026-10-22', sendEmail: true,
    });
  });

  it('shows the state and how it was paid', () => {
    expect(paymentOrderLabel({ status: 'pending', expired: true }).label).toBe('已逾期');
    expect(paymentOrderLabel({ status: 'paid', expired: false }).label).toBe('已付款');
    expect(paidWith({ method: 'card', cardLastFour: '4242', paidNote: null })).toBe('信用卡末四碼 4242');
    expect(paidWith({ method: 'transfer', cardLastFour: null, paidNote: '末五碼 12345' })).toBe('匯款（末五碼 12345）');
  });
});
