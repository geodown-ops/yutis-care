import { describe, expect, it } from 'vitest';
import { cleanCardholder, formatTwd, payErrorMessage, readLink, validateCardholder } from '../src/pay-logic.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

describe('payment page rules', () => {
  it('reads the link token and the return from 3D Secure', () => {
    expect(readLink(`?t=${TOKEN}`)).toEqual({ token: TOKEN, threeDSReturn: false });
    expect(readLink(`?t=${TOKEN}&threeds=1`)).toEqual({ token: TOKEN, threeDSReturn: true });
    expect(readLink('?t=short').token).toBeNull();
    expect(readLink('?t=../../etc').token).toBeNull();
    expect(readLink('').token).toBeNull();
  });

  it('shows amounts in whole NT dollars', () => {
    expect(formatTwd(36000)).toBe('NT$36,000');
  });

  it('checks the cardholder like the API does', () => {
    expect(validateCardholder({ name: '林會計', email: 'ap@acme.test', phoneNumber: '0912-345-678' })).toEqual({});
    expect(validateCardholder({ name: ' ', email: 'nope', phoneNumber: '123' })).toEqual({
      name: '請填寫持卡人姓名', email: '請填寫有效的 Email', phoneNumber: '請填寫手機號碼，例如 0912345678',
    });
    expect(cleanCardholder({ name: ' 林 ', email: ' a@b.test ', phoneNumber: '0912 345 678' })).toEqual({ name: '林', email: 'a@b.test', phoneNumber: '0912345678' });
  });

  it('explains a failed payment without inviting a double charge', () => {
    expect(payErrorMessage(402, { code: 'card_declined' })).toMatch(/銀行沒有核准/);
    expect(payErrorMessage(409, { code: 'already_paid' })).toMatch(/已經付款完成/);
    expect(payErrorMessage(409, { code: 'payment_in_progress' })).toMatch(/不要重複付款/);
    expect(payErrorMessage(502, null)).toMatch(/重新整理頁面確認付款狀態/);
  });
});
