/*
 * Payment orders (付款單), ported from the Bazar site's booking payment: platform staff create an order for a tenant,
 * the payer opens its link on the marketing site and pays by card through TapPay, and the order is marked paid once,
 * whichever of the direct answer, the 3D Secure notify or the payer's return gets there first. Paying adds the order's
 * period to tenant_subscriptions and tells the BillingProvider, like 續約／新期間 does.
 */
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { paymentOrders, plans, platformAuditLog, tenants, type Db, type Tx } from '@yutis/db';
import { eq, type SQL } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { PlatformConfig } from '../config.js';
import { DB, PLATFORM_CONFIG } from '../core/database.js';
import { MAILER, maskEmail, type Mailer } from '../core/mail.js';
import { BILLING, type BillingProvider } from '../integrations/integrations.js';
import { PAYMENTS, type CardTrade, type PaymentGateway } from '../integrations/tappay.js';
import { addSubscriptionPeriod } from '../tenants/subscriptions.js';
import { paymentReceived, paymentRequest } from './emails.js';

export type PaymentOrder = typeof paymentOrders.$inferSelect;

/** Today in Taiwan, YYYY-MM-DD. */
export const todayInTaipei = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);

/** A pending order whose last day to pay has passed. */
export const isExpired = (o: Pick<PaymentOrder, 'status' | 'expiresOn'>, today = todayInTaipei()) => o.status === 'pending' && o.expiresOn < today;

/** YC + yymmdd + 6 random hex digits: short enough to read out on the phone, unique enough for TapPay. */
export const newOrderNumber = (today = todayInTaipei()) => `YC${today.slice(2).replaceAll('-', '')}${randomBytes(3).toString('hex').toUpperCase()}`;

export const newPaymentToken = () => randomBytes(24).toString('base64url');

export type Payment =
  | { method: 'card'; trade: CardTrade }
  | { method: 'transfer'; note: string };

export interface Actor {
  id?: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PAYMENTS) readonly gateway: PaymentGateway,
    @Inject(BILLING) private readonly billing: BillingProvider,
  ) {}

  payUrl(token: string) {
    return `${this.config.siteUrl}/pay/?t=${encodeURIComponent(token)}`;
  }

  /** Where TapPay sends the payer back after 3D Secure, and where it posts the result (it insists on https). */
  threeDSUrls(token: string) {
    return {
      frontendRedirectUrl: `${this.payUrl(token)}&threeds=1`,
      backendNotifyUrl: `${this.config.siteUrl.replace(/^http:\/\//, 'https://')}/platform-api/public/payments/tappay-notify`,
    };
  }

  /**
   * Mark a pending order, already locked FOR UPDATE in `tx`, paid and add its subscription period. When the period cannot
   * be added (a later period was entered meanwhile), the payment still counts and staff add the period by hand.
   */
  async applyPayment(tx: Tx, order: PaymentOrder, payment: Payment): Promise<{ order: PaymentOrder; subscriptionAdded: boolean }> {
    let subscriptionId: string | null = null;
    try {
      // A savepoint, so a refused period leaves the payment itself in place.
      subscriptionId = await tx.transaction(async sp => (await addSubscriptionPeriod(sp, order.tenantId, {
        planId: order.planId, status: 'active', seatLimit: order.seatLimit, startsOn: order.periodStartsOn, endsOn: order.periodEndsOn,
      })).subscriptionId);
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      this.logger.warn(`Payment order ${order.orderNumber}: paid, but its period could not be added: ${error.message}`);
    }
    const [updated] = await tx.update(paymentOrders).set({
      status: 'paid', paidAt: new Date(), updatedAt: new Date(), pendingTradeId: null, subscriptionId, method: payment.method,
      ...(payment.method === 'card'
        ? { gatewayEnv: this.gateway.env, recTradeId: payment.trade.recTradeId, bankTransactionId: payment.trade.bankTransactionId, cardLastFour: payment.trade.cardLastFour }
        : { paidNote: payment.note }),
    }).where(eq(paymentOrders.id, order.id)).returning();
    if (subscriptionId) {
      const [plan] = await tx.select({ code: plans.code }).from(plans).where(eq(plans.id, order.planId));
      await this.billing.subscriptionChanged({ tenantId: order.tenantId, planCode: plan!.code, status: 'active', seatLimit: order.seatLimit });
    }
    return { order: updated!, subscriptionAdded: subscriptionId !== null };
  }

  /** The audit entry for a payment nobody signed in for (the payer's card, TapPay's notify). */
  async auditPublic(tx: Tx, order: PaymentOrder, action: string, actor: Actor, detail: Record<string, unknown>) {
    await tx.insert(platformAuditLog).values({
      actorId: actor.id, actorEmail: actor.email, action, tenantId: order.tenantId, subjectTable: 'payment_orders', subjectId: order.id,
      detail: { orderNumber: order.orderNumber, amount: order.amount, ...detail }, ip: actor.ip, userAgent: actor.userAgent,
    });
  }

  /**
   * Ask TapPay whether the order was paid (after 3D Secure, or when a charge's answer was lost) and, if so, mark it.
   * The redirect and the notify body are never believed on their own.
   */
  async settleFromGateway(where: SQL, actor: Actor): Promise<PaymentOrder | null> {
    const [order] = await this.db.select().from(paymentOrders).where(where);
    if (!order || order.status !== 'pending') return order ?? null;
    const trade = await this.gateway.findPaidTrade({ orderNumber: order.orderNumber, recTradeId: order.pendingTradeId });
    if (!trade) return order;
    const settled = await this.db.transaction(async tx => {
      const [locked] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, order.id)).for('update');
      if (locked!.status !== 'pending') return { order: locked!, paidNow: false };
      if (trade.amount !== locked!.amount) {
        this.logger.error(`Payment order ${locked!.orderNumber}: TapPay trade ${trade.recTradeId} is for ${trade.amount}, not ${locked!.amount}; not marked paid`);
        return { order: locked!, paidNow: false };
      }
      const { order: paid, subscriptionAdded } = await this.applyPayment(tx, locked!, { method: 'card', trade });
      await this.auditPublic(tx, paid, 'payment_order.pay', actor, { method: 'card', recTradeId: trade.recTradeId, threeDS: true, subscriptionAdded });
      return { order: paid, paidNow: true };
    });
    if (settled.paidNow) await this.sendReceipt(settled.order);
    return settled.order;
  }

  /** Best effort: a failed email never undoes the payment, which shows in the platform admin either way. */
  async sendReceipt(order: PaymentOrder) {
    const tenantName = await this.tenantName(order.tenantId);
    await this.trySend(order, paymentReceived(order, tenantName, this.config.siteUrl));
  }

  /** The payment link to the payer; false when the email provider refused it. */
  async sendPaymentRequest(order: PaymentOrder, tenantName: string): Promise<boolean> {
    return this.trySend(order, paymentRequest(order, tenantName, this.payUrl(order.token), this.config.siteUrl));
  }

  private async trySend(order: PaymentOrder, mail: Parameters<Mailer['send']>[0]): Promise<boolean> {
    try {
      await this.mailer.send(mail);
      return true;
    } catch (error) {
      this.logger.warn(`Payment order ${order.orderNumber}: email to ${maskEmail(mail.to)} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async tenantName(tenantId: string) {
    const [t] = await this.db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
    return t?.name ?? '';
  }
}
