/*
 * Card payments (信用卡金流) through TapPay Direct Pay, ported from the Bazar site (geodown-ops/bazar, server.js). The
 * payment page collects the card in TapPay's own fields and hands us a one-time prime, so no card number ever reaches
 * Yutis Care; we charge it with Pay by Prime. With 3D Secure the payer is sent to their bank's page and back, and the
 * result is only believed after asking TapPay's record API, never from the redirect or the notify body.
 */
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { TapPayConfig } from '../config.js';

/** What the payment page's TapPay SDK is set up with (TPDirect.setupSDK). The app key is a public client key. */
export interface PaymentClientConfig {
  appId: number;
  appKey: string;
  env: 'sandbox' | 'production';
}

/** A charge the bank authorised or captured. */
export interface CardTrade {
  recTradeId: string;
  bankTransactionId: string;
  cardLastFour: string;
  amount: number;
}

export interface ChargeRequest {
  prime: string;
  /** NT$, whole dollars. */
  amount: number;
  orderNumber: string;
  /** Shown on TapPay's records; at most 100 characters. */
  details: string;
  cardholder: { name: string; email: string; phoneNumber: string };
  /** Required when 3D Secure is on: where the bank sends the payer back, and where TapPay posts the result. */
  threeDS?: { frontendRedirectUrl: string; backendNotifyUrl: string };
}

export type ChargeResult =
  | { kind: 'paid'; trade: CardTrade }
  /** 3D Secure: send the payer to paymentUrl; the result comes later (notify, or findPaidTrade on their return). */
  | { kind: 'verify'; paymentUrl: string; recTradeId: string }
  | { kind: 'declined'; code: number; message: string };

/** The payment provider (金流). A second provider would be another implementation of this. */
export interface PaymentGateway {
  /** Null when card payments are not configured. */
  clientConfig(): PaymentClientConfig | null;
  /** sandbox or production; null when not configured. */
  readonly env: string | null;
  readonly use3DS: boolean;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** TapPay's record of an authorised or captured charge for this order (the given trade, else any), or null. */
  findPaidTrade(query: { orderNumber: string; recTradeId?: string | null }): Promise<CardTrade | null>;
}

export const PAYMENTS = Symbol('PAYMENTS');

const unavailable = () => new ServiceUnavailableException({ code: 'payments_unavailable', message: 'Card payments are not configured' });

export class UnconfiguredPaymentGateway implements PaymentGateway {
  readonly env = null;
  readonly use3DS = false;
  clientConfig() { return null; }
  async charge(): Promise<ChargeResult> { throw unavailable(); }
  async findPaidTrade(): Promise<CardTrade | null> { throw unavailable(); }
}

interface TapPayTrade {
  rec_trade_id?: string;
  bank_transaction_id?: string;
  order_number?: string;
  amount?: number;
  record_status?: number;
  time?: number;
  card_info?: { last_four?: string };
  partial_card_number?: string;
}

/** record_status in TapPay's trade records: 0 = 銀行授權成功 (authorised), 1 = 已請款 (captured). */
const isPaid = (r: TapPayTrade) => r.record_status === 0 || r.record_status === 1;

const toTrade = (r: TapPayTrade): CardTrade => ({
  recTradeId: r.rec_trade_id ?? '',
  bankTransactionId: r.bank_transaction_id ?? '',
  cardLastFour: r.card_info?.last_four ?? (r.partial_card_number ? String(r.partial_card_number).slice(-4) : ''),
  amount: Number(r.amount ?? 0),
});

export class TapPayGateway implements PaymentGateway {
  private readonly logger = new Logger('TapPay');
  private readonly host: string;

  constructor(private readonly config: TapPayConfig, private readonly fetchFn: typeof fetch = fetch) {
    this.host = config.env === 'production' ? 'https://prod.tappaysdk.com' : 'https://sandbox.tappaysdk.com';
  }

  get env() { return this.config.env; }
  get use3DS() { return this.config.use3DS; }

  clientConfig(): PaymentClientConfig {
    return { appId: this.config.appId, appKey: this.config.appKey, env: this.config.env };
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const body: Record<string, unknown> = {
      prime: request.prime,
      partner_key: this.config.partnerKey,
      merchant_id: this.config.merchantId,
      amount: request.amount, // TWD: no x100
      currency: 'TWD',
      order_number: request.orderNumber,
      details: request.details.slice(0, 100),
      cardholder: { phone_number: request.cardholder.phoneNumber, name: request.cardholder.name, email: request.cardholder.email },
      remember: false,
    };
    if (this.config.use3DS) {
      if (!request.threeDS) throw new Error('3D Secure is on but the charge has no result URLs');
      body.three_domain_secure = true;
      body.result_url = { frontend_redirect_url: request.threeDS.frontendRedirectUrl, backend_notify_url: request.threeDS.backendNotifyUrl };
    }
    const result = await this.post<TapPayTrade & { status: number; msg?: string; payment_url?: string }>('/tpc/payment/pay-by-prime', body);
    if (result.status !== 0) {
      this.logger.warn(`Charge for ${request.orderNumber} refused: ${result.status} ${result.msg ?? ''}`);
      return { kind: 'declined', code: result.status, message: result.msg ?? '' };
    }
    if (this.config.use3DS && result.payment_url) return { kind: 'verify', paymentUrl: result.payment_url, recTradeId: result.rec_trade_id ?? '' };
    return { kind: 'paid', trade: toTrade({ ...result, amount: result.amount ?? request.amount }) };
  }

  async findPaidTrade({ orderNumber, recTradeId }: { orderNumber: string; recTradeId?: string | null }): Promise<CardTrade | null> {
    const filters = recTradeId ? { rec_trade_id: recTradeId } : { order_number: orderNumber };
    const result = await this.post<{ status: number; msg?: string; trade_records?: TapPayTrade[] }>('/tpc/transaction/query', {
      partner_key: this.config.partnerKey, filters,
    });
    // Like Bazar, only the records count: a query that matched nothing has none, whatever its status says.
    if (result.status !== 0) this.logger.warn(`Record query for ${orderNumber} answered ${result.status} ${result.msg ?? ''}`);
    const records = (result.trade_records ?? [])
      .filter(r => r.order_number === undefined || r.order_number === orderNumber)
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    const paid = records.find(isPaid);
    return paid ? toTrade(paid) : null;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.host}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.config.partnerKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`TapPay ${path} answered HTTP ${res.status}`);
    return await res.json() as T;
  }
}

export function createPaymentGateway(config: TapPayConfig | undefined): PaymentGateway {
  return config ? new TapPayGateway(config) : new UnconfiguredPaymentGateway();
}
