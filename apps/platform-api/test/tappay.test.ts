/* The TapPay client against a recorded fetch, and its configuration. */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { TapPayGateway, UnconfiguredPaymentGateway } from '../src/integrations/tappay.js';

const base = { NODE_ENV: 'test', PLATFORM_DATABASE_URL: 'postgres://x/y', PLATFORM_DEV_AUTH: 'true' };
const keys = { TAPPAY_APP_ID: '11327', TAPPAY_APP_KEY: 'app_x', TAPPAY_PARTNER_KEY: 'partner_x', TAPPAY_MERCHANT_ID: 'yutis_CTBC' };

function recorder(answers: unknown[]) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(answers.shift()), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const config = { env: 'sandbox' as const, appId: 11327, appKey: 'app_x', partnerKey: 'partner_x', merchantId: 'yutis_CTBC', use3DS: false };
const request = { prime: 'p', amount: 36000, orderNumber: 'YC1', details: 'Yutis Care 標準方案', cardholder: { name: '林', email: 'a@b.test', phoneNumber: '0912345678' } };

describe('configuration', () => {
  it('needs all four TapPay values or none, and turns 3D Secure on in production', () => {
    expect(loadConfig(base).tappay).toBeUndefined();
    expect(() => loadConfig({ ...base, TAPPAY_APP_ID: '1' })).toThrow(/go together/);
    expect(loadConfig({ ...base, ...keys }).tappay).toEqual({ ...config });
    expect(loadConfig({ ...base, ...keys, TAPPAY_ENV: 'production' }).tappay).toMatchObject({ env: 'production', use3DS: true });
    expect(loadConfig({ ...base, ...keys, TAPPAY_ENV: 'production', TAPPAY_USE_3DS: 'false' }).tappay).toMatchObject({ use3DS: false });
  });

  it('puts the payment page on the marketing site', () => {
    expect(loadConfig({ ...base, TENANT_BASE_DOMAIN: 'care.yutis.net' }).siteUrl).toBe('https://care.yutis.net');
    expect(loadConfig({ ...base, PUBLIC_SITE_URL: 'http://127.0.0.1.nip.io:5184/' }).siteUrl).toBe('http://127.0.0.1.nip.io:5184');
  });
});

describe('TapPay Pay by Prime', () => {
  it('charges with the partner key and merchant, in whole NT$', async () => {
    const { calls, fetchFn } = recorder([{ status: 0, rec_trade_id: 'D1', bank_transaction_id: 'TP1', amount: 36000, card_info: { last_four: '4242' } }]);
    const result = await new TapPayGateway(config, fetchFn).charge(request);
    expect(result).toEqual({ kind: 'paid', trade: { recTradeId: 'D1', bankTransactionId: 'TP1', cardLastFour: '4242', amount: 36000 } });
    expect(calls[0]!.url).toBe('https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime');
    expect(calls[0]!.headers['x-api-key']).toBe('partner_x');
    expect(calls[0]!.body).toEqual({
      prime: 'p', partner_key: 'partner_x', merchant_id: 'yutis_CTBC', amount: 36000, currency: 'TWD', order_number: 'YC1',
      details: 'Yutis Care 標準方案', cardholder: { phone_number: '0912345678', name: '林', email: 'a@b.test' }, remember: false,
    });
  });

  it('asks for 3D Secure and hands back the bank page', async () => {
    const { calls, fetchFn } = recorder([{ status: 0, rec_trade_id: 'D3', payment_url: 'https://bank.test/3ds' }]);
    const gw = new TapPayGateway({ ...config, env: 'production', use3DS: true }, fetchFn);
    const urls = { frontendRedirectUrl: 'https://care.test/pay/?t=x&threeds=1', backendNotifyUrl: 'https://care.test/n' };
    expect(await gw.charge({ ...request, threeDS: urls })).toEqual({ kind: 'verify', paymentUrl: 'https://bank.test/3ds', recTradeId: 'D3' });
    expect(calls[0]!.url).toBe('https://prod.tappaysdk.com/tpc/payment/pay-by-prime');
    expect(calls[0]!.body).toMatchObject({ three_domain_secure: true, result_url: { frontend_redirect_url: urls.frontendRedirectUrl, backend_notify_url: urls.backendNotifyUrl } });
    await expect(gw.charge(request)).rejects.toThrow(/result URLs/);
  });

  it('reports a refused card', async () => {
    const { fetchFn } = recorder([{ status: 10003, msg: 'Card Error' }]);
    expect(await new TapPayGateway(config, fetchFn).charge(request)).toEqual({ kind: 'declined', code: 10003, message: 'Card Error' });
  });

  it('finds the newest authorised or captured record for the order', async () => {
    const { calls, fetchFn } = recorder([
      { status: 0, trade_records: [
        { rec_trade_id: 'OLD', order_number: 'YC1', record_status: 1, time: 1, amount: 36000, partial_card_number: '424242******1111' },
        { rec_trade_id: 'NEW', order_number: 'YC1', record_status: 0, time: 2, amount: 36000, partial_card_number: '424242******4242' },
        { rec_trade_id: 'FAILED', order_number: 'YC1', record_status: -1, time: 3, amount: 36000 },
        { rec_trade_id: 'OTHER', order_number: 'YC2', record_status: 1, time: 4, amount: 36000 },
      ] },
      { status: 2, msg: 'no record' },
    ]);
    const gw = new TapPayGateway(config, fetchFn);
    expect(await gw.findPaidTrade({ orderNumber: 'YC1' })).toEqual({ recTradeId: 'NEW', bankTransactionId: '', cardLastFour: '4242', amount: 36000 });
    expect(calls[0]!.body).toEqual({ partner_key: 'partner_x', filters: { order_number: 'YC1' } });
    expect(await gw.findPaidTrade({ orderNumber: 'YC1', recTradeId: 'D3' })).toBeNull();
    expect(calls[1]!.body).toEqual({ partner_key: 'partner_x', filters: { rec_trade_id: 'D3' } });
  });

  it('offers no card payment when not configured', async () => {
    const gw = new UnconfiguredPaymentGateway();
    expect(gw.clientConfig()).toBeNull();
    await expect(gw.charge()).rejects.toMatchObject({ status: 503 });
  });
});
