/*
 * Billing extension points. Tenants will be billed, but the billing model is not decided yet, so these tables
 * only record what a future billing module will need: which plan a tenant is on, its seat limit and term, and
 * monthly usage. Nothing reads them to charge anyone yet. All four programmes come with every plan; there is
 * no per-module switch.
 *
 * Access (migrations/0003_billing_access.sql): plans are read-only to the tenant API; a tenant can read its own
 * subscription but never change it; usage_counters are written by the tenant API and worker for their own
 * tenant (e.g. one more SMS sent) and never deleted.
 */
import { desc, sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './common.js';
import { platformUsers } from './platform.js';

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** Pricing parameters, opaque until the billing model is decided (e.g. per-seat price, included SMS). */
  pricing: jsonb('pricing').notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionStatusEnum = pgEnum('subscription_status', ['trial', 'active', 'past_due', 'cancelled']);

export const tenantSubscriptions = pgTable('tenant_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('trial'),
  /** Active employees allowed; null = no limit. Exceeding it warns tenant admins, it does not block. */
  seatLimit: integer('seat_limit'),
  startsOn: date('starts_on').notNull(),
  /** Null = open-ended. */
  endsOn: date('ends_on'),
  /** Customer or subscription id at the payment provider, once one is chosen. */
  billingRef: text('billing_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check('tenant_subscriptions_term', sql`${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
  check('tenant_subscriptions_seat_limit', sql`${t.seatLimit} is null or ${t.seatLimit} > 0`),
]);

/**
 * ORDER BY terms that put a tenant's subscription in effect today (Taiwan time) first: periods that have started, newest
 * first, then periods that start later. A renewal can be entered before the current period ends.
 */
export const currentSubscriptionFirst = () => [
  sql`${tenantSubscriptions.startsOn} > (now() at time zone 'Asia/Taipei')::date`,
  desc(tenantSubscriptions.startsOn),
  desc(tenantSubscriptions.createdAt),
];

/**
 * What gets counted per tenant per month. SMS is paid by the operator, so it is counted per tenant even though
 * tenants are not charged for it today.
 */
export const usageMetricEnum = pgEnum('usage_metric', ['active_employees', 'sms_sent']);

export const usageCounters = pgTable('usage_counters', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  /** First day of the month. */
  period: date('period').notNull(),
  metric: usageMetricEnum('metric').notNull(),
  quantity: bigint('quantity', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.tenantId, t.period, t.metric] }),
  check('usage_counters_period_is_month', sql`extract(day from ${t.period}) = 1`),
  check('usage_counters_quantity', sql`${t.quantity} >= 0`),
]);

export const paymentOrderStatusEnum = pgEnum('payment_order_status', ['pending', 'paid', 'cancelled']);

/**
 * 付款單: one amount a tenant owes for one subscription period, paid by card on the marketing site's payment page
 * (care.yutis.net/pay/?t=<token>) through TapPay, or marked paid by platform staff after a bank transfer. Platform
 * staff set the amount; plans.pricing is still not read. Paying adds the period to tenant_subscriptions. Platform
 * data only (migrations/0031_payment_orders_access.sql): the tenant API cannot read it. No card number is ever here,
 * only what TapPay returns (trade id, last four digits).
 */
export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  /** Sent to TapPay as order_number and shown to the payer, e.g. YC2610081A2B3C. */
  orderNumber: text('order_number').notNull().unique(),
  /** Unguessable; the payment page link carries it. Whoever has the link can pay, which is the point. */
  token: text('token').notNull().unique(),
  status: paymentOrderStatusEnum('status').notNull().default('pending'),
  /** NT$, whole dollars (TapPay takes TWD without decimals). */
  amount: integer('amount').notNull(),
  /** What the payer sees and TapPay records, e.g. 標準方案 2027/01/01–2027/12/31，200 人. */
  description: text('description').notNull(),
  /** The subscription period paying for this order adds. */
  planId: uuid('plan_id').notNull().references(() => plans.id),
  seatLimit: integer('seat_limit'),
  periodStartsOn: date('period_starts_on').notNull(),
  periodEndsOn: date('period_ends_on'),
  payerName: text('payer_name').notNull(),
  payerEmail: text('payer_email').notNull(),
  /** The payment page refuses the order after this day (Taiwan time). */
  expiresOn: date('expires_on').notNull(),
  /** How it was paid: card (TapPay) or transfer (marked by platform staff). */
  method: text('method'),
  /** TapPay environment the charge went to: sandbox or production. */
  gatewayEnv: text('gateway_env'),
  /** A 3D Secure charge waiting for the bank: its TapPay trade id, settled by the notify or the payer's return. */
  pendingTradeId: text('pending_trade_id'),
  recTradeId: text('rec_trade_id'),
  bankTransactionId: text('bank_transaction_id'),
  cardLastFour: text('card_last_four'),
  /** Platform staff's note when marking a transfer paid (e.g. 匯款末五碼). */
  paidNote: text('paid_note'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  /** The period added when it was paid; null when it could not be added automatically (staff add it by hand). */
  subscriptionId: uuid('subscription_id').references(() => tenantSubscriptions.id),
  createdBy: uuid('created_by').references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('payment_orders_tenant_idx').on(t.tenantId, t.createdAt),
  check('payment_orders_amount', sql`${t.amount} > 0`),
  check('payment_orders_seat_limit', sql`${t.seatLimit} is null or ${t.seatLimit} > 0`),
  check('payment_orders_term', sql`${t.periodEndsOn} is null or ${t.periodEndsOn} >= ${t.periodStartsOn}`),
  check('payment_orders_paid', sql`(${t.status} = 'paid') = (${t.paidAt} is not null)`),
]);
