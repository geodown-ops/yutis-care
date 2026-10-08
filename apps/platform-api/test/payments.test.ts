/*
 * Payment orders and the public payment page against a real PostgreSQL, with a recording stand-in for TapPay.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { paymentOrders, platformAuditLog, platformUsers, plans, tenants, tenantSubscriptions, type Db } from '@yutis/db';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Mail, Mailer } from '../src/core/mail.js';
import type { CardTrade, ChargeRequest, ChargeResult, PaymentGateway } from '../src/integrations/tappay.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

class FakeGateway implements PaymentGateway {
  env = 'sandbox';
  use3DS = false;
  charges: ChargeRequest[] = [];
  /** What the next charge answers (or throws). */
  next: ChargeResult | Error = { kind: 'paid', trade: { recTradeId: 'D2026', bankTransactionId: 'TP1', cardLastFour: '4242', amount: 0 } };
  /** TapPay's records: paid trades by order number. */
  records = new Map<string, CardTrade>();
  queries: { orderNumber: string; recTradeId?: string | null }[] = [];
  clientConfig() { return { appId: 11327, appKey: 'app_public', env: 'sandbox' as const }; }
  async charge(r: ChargeRequest) {
    this.charges.push(r);
    if (this.next instanceof Error) throw this.next;
    return this.next.kind === 'paid' ? { ...this.next, trade: { ...this.next.trade, amount: r.amount } } : this.next;
  }
  async findPaidTrade(q: { orderNumber: string; recTradeId?: string | null }) {
    this.queries.push(q);
    return this.records.get(q.orderNumber) ?? null;
  }
}

class RecordingEmail implements Mailer {
  sent: Mail[] = [];
  async send(m: Mail) { this.sent.push(m); }
}

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const gateway = new FakeGateway();
const email = new RecordingEmail();
let tenantId = '';
const OPS = 'ops@yutis.test', SUPPORT = 'support@yutis.test';

function call(method: 'GET' | 'POST', url: string, as?: string, body?: unknown) {
  return app.inject({
    method, url: `/platform-api${url}`,
    headers: as ? { 'x-dev-platform-user': as } : {},
    ...(body === undefined ? {} : { payload: body as object }),
  });
}

const orderBody = (extra: Record<string, unknown> = {}) => ({
  tenantId, planCode: 'standard', seatLimit: 200, startsOn: '2026-11-01', endsOn: '2027-10-31', amount: 36000,
  payerName: '林會計', payerEmail: 'AP@Acme.test', ...extra,
});

const tokenOf = (payUrl: string) => new URL(payUrl).searchParams.get('t')!;
const card = { prime: 'prime_test', cardholder: { name: '林會計', email: 'ap@acme.test', phoneNumber: '0912345678' } };

async function newOrder(extra: Record<string, unknown> = {}) {
  const res = await call('POST', '/payment-orders', OPS, orderBody({ sendEmail: false, endsOn: null, ...extra }));
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; orderNumber: string; payUrl: string };
}

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  await owner.insert(platformUsers).values([{ email: OPS, name: '營運小王', role: '營運' }, { email: SUPPORT, name: '客服小李', role: '客服' }]);
  const [plan] = await owner.insert(plans).values({ code: 'standard', name: '標準方案' }).returning();
  const [acme] = await owner.insert(tenants).values({ slug: 'acme', name: 'Acme 股份有限公司' }).returning();
  tenantId = acme!.id;
  await owner.insert(tenantSubscriptions).values({ tenantId, planId: plan!.id, status: 'trial', seatLimit: 100, startsOn: '2026-10-01' });

  const config = loadConfig({ NODE_ENV: 'test', PLATFORM_DATABASE_URL: db.platformUrl, PLATFORM_DEV_AUTH: 'true', TENANT_BASE_DOMAIN: 'care.test' });
  app = await createApp(config, { overrides: { integrations: { payments: gateway }, mailer: email }, logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await db?.drop();
});

beforeEach(() => {
  gateway.use3DS = false;
  gateway.next = { kind: 'paid', trade: { recTradeId: 'D2026', bankTransactionId: 'TP1', cardLastFour: '4242', amount: 0 } };
  gateway.records.clear();
});

describe('payment orders in the platform admin', () => {
  it('creates an order, emails its link and audits it', async () => {
    const res = await call('POST', '/payment-orders', OPS, orderBody());
    expect(res.statusCode, res.body).toBe(201);
    const o = res.json();
    expect(o).toMatchObject({
      tenantName: 'Acme 股份有限公司', status: 'pending', expired: false, amount: 36000, planCode: 'standard', payerEmail: 'ap@acme.test',
      description: '標準方案 2026/11/01–2027/10/31，200 人', subscriptionAdded: false, createdBy: OPS, emailSent: true,
    });
    expect(o.orderNumber).toMatch(/^YC\d{6}[0-9A-F]{6}$/);
    expect(o.payUrl).toMatch(/^https:\/\/care\.test\/pay\/\?t=[A-Za-z0-9_-]{32}$/);
    const mail = email.sent.at(-1)!;
    expect(mail.to).toBe('ap@acme.test');
    expect(mail.subject).toBe(`Acme 股份有限公司 Yutis Care 付款通知（${o.orderNumber}）`);
    expect(mail.text).toContain(o.payUrl);
    expect(mail.text).toContain('NT$36,000');
    const [audit] = await owner.select().from(platformAuditLog).where(eq(platformAuditLog.subjectId, o.id));
    expect(audit).toMatchObject({ action: 'payment_order.create', actorEmail: OPS, tenantId });
  });

  it('is for operations only, and the period must come after the latest one', async () => {
    expect((await call('POST', '/payment-orders', SUPPORT, orderBody())).statusCode).toBe(403);
    expect((await call('GET', `/payment-orders?tenantId=${tenantId}`, SUPPORT)).statusCode).toBe(200);
    const overlap = await call('POST', '/payment-orders', OPS, orderBody({ startsOn: '2026-10-01' }));
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json()).toMatchObject({ code: 'period_overlap' });
    expect((await call('POST', '/payment-orders', OPS, orderBody({ amount: 0 }))).statusCode).toBe(400);
  });

  it('cancels a pending order, after which it cannot be paid', async () => {
    const o = await newOrder();
    expect((await call('POST', `/payment-orders/${o.id}/cancel`, OPS)).json()).toMatchObject({ status: 'cancelled' });
    expect((await call('POST', `/payment-orders/${o.id}/cancel`, OPS)).json()).toMatchObject({ code: 'payment_order_closed' });
    const pay = await call('POST', `/public/payments/${tokenOf(o.payUrl)}/pay`, undefined, card);
    expect(pay.statusCode).toBe(409);
    expect(pay.json()).toMatchObject({ code: 'order_cancelled' });
    expect((await call('GET', `/public/payments/${tokenOf(o.payUrl)}`)).json()).toMatchObject({ status: 'cancelled', card: null });
  });
});

describe('the public payment page', () => {
  it('shows the order to whoever has the link, and nothing for a wrong one', async () => {
    const o = await newOrder();
    const res = await call('GET', `/public/payments/${tokenOf(o.payUrl)}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      orderNumber: o.orderNumber, tenantName: 'Acme 股份有限公司', description: '標準方案 2026/11/01 起，200 人', amount: 36000, status: 'pending',
      expiresOn: expect.any(String), payerName: '林會計', payerEmail: 'ap@acme.test', paidAt: null, method: null, cardLastFour: null,
      card: { appId: 11327, appKey: 'app_public', env: 'sandbox' },
    });
    expect((await call('GET', '/public/payments/not-a-real-token-at-all-0000')).statusCode).toBe(404);
    expect((await call('GET', '/public/payments/x')).statusCode).toBe(404);
  });

  it('charges the card once, adds the paid period and sends a receipt', async () => {
    const o = await newOrder({ startsOn: '2026-12-01', endsOn: '2027-11-30' });
    const token = tokenOf(o.payUrl);
    const sentBefore = email.sent.length;
    const res = await call('POST', `/public/payments/${token}/pay`, undefined, card);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ result: 'paid', payment: { status: 'paid', method: 'card', cardLastFour: '4242' } });
    expect(gateway.charges.at(-1)).toMatchObject({ prime: 'prime_test', amount: 36000, orderNumber: o.orderNumber, cardholder: card.cardholder });
    expect(gateway.charges.at(-1)!.threeDS).toBeUndefined();

    const [row] = await owner.select().from(paymentOrders).where(eq(paymentOrders.id, o.id));
    expect(row).toMatchObject({ status: 'paid', method: 'card', recTradeId: 'D2026', bankTransactionId: 'TP1', gatewayEnv: 'sandbox' });
    const periods = await owner.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId)).orderBy(asc(tenantSubscriptions.startsOn));
    expect(periods.map(p => [p.status, p.startsOn, p.endsOn, p.seatLimit])).toEqual([
      ['trial', '2026-10-01', '2026-11-30', 100],
      ['active', '2026-12-01', '2027-11-30', 200],
    ]);
    expect(row!.subscriptionId).toBe(periods[1]!.id);
    expect(email.sent.slice(sentBefore).map(m => m.subject)).toEqual([`Yutis Care 付款完成（${o.orderNumber}）`]);
    expect(email.sent.at(-1)!.text).toContain('末四碼 4242');
    const [audit] = await owner.select().from(platformAuditLog).where(eq(platformAuditLog.action, 'payment_order.pay'));
    expect(audit).toMatchObject({ actorEmail: 'ap@acme.test', tenantId, subjectId: o.id });

    const again = await call('POST', `/public/payments/${token}/pay`, undefined, card);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'already_paid' });
    const listed = await call('GET', `/payment-orders?tenantId=${tenantId}`, OPS);
    expect(listed.json().find((x: { id: string }) => x.id === o.id)).toMatchObject({ status: 'paid', subscriptionAdded: true });
  });

  it('records a payment whose period no longer fits, without the period', async () => {
    const o = await newOrder({ startsOn: '2027-01-01', endsOn: null });
    // Meanwhile staff entered a later period by hand.
    const [plan] = await owner.select().from(plans);
    await owner.insert(tenantSubscriptions).values({ tenantId, planId: plan!.id, status: 'active', startsOn: '2028-01-01' });
    const res = await call('POST', `/public/payments/${tokenOf(o.payUrl)}/pay`, undefined, card);
    expect(res.statusCode, res.body).toBe(200);
    const list = (await call('GET', `/payment-orders?tenantId=${tenantId}`, OPS)).json();
    expect(list.find((x: { id: string }) => x.id === o.id)).toMatchObject({ status: 'paid', subscriptionAdded: false });
    await owner.delete(tenantSubscriptions).where(eq(tenantSubscriptions.startsOn, '2028-01-01'));
  });

  it('leaves a declined card pending', async () => {
    const o = await newOrder({ startsOn: '2029-01-01' });
    gateway.next = { kind: 'declined', code: 10003, message: 'Card Error' };
    const res = await call('POST', `/public/payments/${tokenOf(o.payUrl)}/pay`, undefined, card);
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ code: 'card_declined' });
    expect((await call('GET', `/public/payments/${tokenOf(o.payUrl)}`)).json()).toMatchObject({ status: 'pending' });
    expect((await call('POST', `/public/payments/${tokenOf(o.payUrl)}/pay`, undefined, { prime: '' })).statusCode).toBe(400);
  });

  it('asks TapPay when a charge gets no answer, and only marks it paid if TapPay has it', async () => {
    const lost = await newOrder({ startsOn: '2030-01-01' });
    gateway.next = new Error('socket hang up');
    const res = await call('POST', `/public/payments/${tokenOf(lost.payUrl)}/pay`, undefined, card);
    expect(res.statusCode).toBe(502);
    expect((await call('GET', `/public/payments/${tokenOf(lost.payUrl)}`)).json()).toMatchObject({ status: 'pending' });

    gateway.records.set(lost.orderNumber, { recTradeId: 'D-LOST', bankTransactionId: 'TP9', cardLastFour: '1111', amount: 36000 });
    const retry = await call('POST', `/public/payments/${tokenOf(lost.payUrl)}/pay`, undefined, card);
    expect(retry.json()).toMatchObject({ result: 'paid', payment: { cardLastFour: '1111' } });
  });

  it('goes through 3D Secure: the bank page, then the notify or the return settles it once', async () => {
    gateway.use3DS = true;
    const o = await newOrder({ startsOn: '2031-01-01' });
    const token = tokenOf(o.payUrl);
    gateway.next = { kind: 'verify', paymentUrl: 'https://sandbox.tappaysdk.com/3ds/abc', recTradeId: 'D3DS' };
    const res = await call('POST', `/public/payments/${token}/pay`, undefined, card);
    expect(res.json()).toMatchObject({ result: 'verify', paymentUrl: 'https://sandbox.tappaysdk.com/3ds/abc', payment: { status: 'pending' } });
    expect(gateway.charges.at(-1)!.threeDS).toEqual({
      frontendRedirectUrl: `https://care.test/pay/?t=${token}&threeds=1`,
      backendNotifyUrl: 'https://care.test/platform-api/public/payments/tappay-notify',
    });
    const [pending] = await owner.select().from(paymentOrders).where(eq(paymentOrders.id, o.id));
    expect(pending!.pendingTradeId).toBe('D3DS');

    // Back from the bank before TapPay has a record: still pending.
    expect((await call('POST', `/public/payments/${token}/verify`)).json()).toMatchObject({ status: 'pending' });
    expect(gateway.queries.at(-1)).toEqual({ orderNumber: o.orderNumber, recTradeId: 'D3DS' });

    // A notify claiming success proves nothing until TapPay's records agree.
    expect((await call('POST', '/public/payments/tappay-notify', undefined, { order_number: o.orderNumber, status: 0 })).json()).toEqual({ status: 0 });
    expect((await owner.select().from(paymentOrders).where(eq(paymentOrders.id, o.id)))[0]!.status).toBe('pending');

    // A record for another amount is not this payment.
    gateway.records.set(o.orderNumber, { recTradeId: 'D3DS', bankTransactionId: 'TP3', cardLastFour: '0000', amount: 1 });
    await call('POST', '/public/payments/tappay-notify', undefined, { order_number: o.orderNumber });
    expect((await owner.select().from(paymentOrders).where(eq(paymentOrders.id, o.id)))[0]!.status).toBe('pending');

    gateway.records.set(o.orderNumber, { recTradeId: 'D3DS', bankTransactionId: 'TP3', cardLastFour: '0000', amount: 36000 });
    const sentBefore = email.sent.length;
    await call('POST', '/public/payments/tappay-notify', undefined, { order_number: o.orderNumber });
    expect((await call('POST', `/public/payments/${token}/verify`)).json()).toMatchObject({ status: 'paid', cardLastFour: '0000' });
    await call('POST', '/public/payments/tappay-notify', undefined, { order_number: o.orderNumber });
    expect(email.sent.length - sentBefore).toBe(1);
    expect((await call('POST', '/public/payments/tappay-notify', undefined, {})).json()).toEqual({ status: 0 });
  });

  it('marks a bank transfer paid by hand', async () => {
    const o = await newOrder({ startsOn: '2032-01-01' });
    expect((await call('POST', `/payment-orders/${o.id}/mark-paid`, SUPPORT, { note: '匯款末五碼 12345' })).statusCode).toBe(403);
    const res = await call('POST', `/payment-orders/${o.id}/mark-paid`, OPS, { note: '匯款末五碼 12345' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'paid', method: 'transfer', paidNote: '匯款末五碼 12345', subscriptionAdded: true });
    expect(email.sent.at(-1)!.text).toContain('付款方式：匯款');
    expect((await call('POST', `/payment-orders/${o.id}/mark-paid`, OPS, { note: 'x' })).json()).toMatchObject({ code: 'payment_order_closed' });
  });

  it('refuses an order past its last day to pay', async () => {
    const o = await newOrder({ startsOn: '2033-01-01' });
    await owner.update(paymentOrders).set({ expiresOn: '2020-01-01' }).where(eq(paymentOrders.id, o.id));
    expect((await call('GET', `/public/payments/${tokenOf(o.payUrl)}`)).json()).toMatchObject({ status: 'expired' });
    const res = await call('POST', `/public/payments/${tokenOf(o.payUrl)}/pay`, undefined, card);
    expect(res.json()).toMatchObject({ code: 'order_expired' });
  });
});
