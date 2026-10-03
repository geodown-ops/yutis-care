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
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './common.js';

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
