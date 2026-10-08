/* Adding a subscription period, shared by 續約／新期間 (tenants.controller.ts) and paid payment orders (payments/). */
import { ConflictException } from '@nestjs/common';
import { subscriptionStatusEnum, tenantSubscriptions, type Tx } from '@yutis/db';
import { desc, eq } from 'drizzle-orm';

export interface NewPeriodInput {
  planId: string;
  status: (typeof subscriptionStatusEnum.enumValues)[number];
  seatLimit: number | null;
  startsOn: string;
  endsOn: string | null;
}

const dayBefore = (isoDate: string) => new Date(Date.parse(isoDate) - 86_400_000).toISOString().slice(0, 10);

/** The tenant's latest period (by start date), which a new one must start after. */
export async function latestPeriod(tx: Tx, tenantId: string) {
  const [latest] = await tx.select().from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId)).orderBy(desc(tenantSubscriptions.startsOn), desc(tenantSubscriptions.createdAt)).limit(1);
  return latest ?? null;
}

export const periodOverlap = (latestStartsOn: string) =>
  new ConflictException({ code: 'period_overlap', message: `A new period must start after the latest one (${latestStartsOn})` });

/**
 * Add a period after the latest one, which stays in the history. When the latest period has no end, or ends on or after
 * the new start, it now ends the day before. Throws period_overlap when the new period does not start after it.
 */
export async function addSubscriptionPeriod(tx: Tx, tenantId: string, input: NewPeriodInput): Promise<{ subscriptionId: string; previousEndsOn?: string }> {
  const latest = await latestPeriod(tx, tenantId);
  let previousEndsOn: string | undefined;
  if (latest) {
    if (input.startsOn <= latest.startsOn) throw periodOverlap(latest.startsOn);
    if (latest.endsOn === null || latest.endsOn >= input.startsOn) {
      previousEndsOn = dayBefore(input.startsOn);
      await tx.update(tenantSubscriptions).set({ endsOn: previousEndsOn, updatedAt: new Date() }).where(eq(tenantSubscriptions.id, latest.id));
    }
  }
  const [row] = await tx.insert(tenantSubscriptions).values({
    tenantId, planId: input.planId, status: input.status, seatLimit: input.seatLimit, startsOn: input.startsOn, endsOn: input.endsOn,
    billingRef: latest?.billingRef ?? null,
  }).returning({ id: tenantSubscriptions.id });
  return { subscriptionId: row!.id, ...(previousEndsOn ? { previousEndsOn } : {}) };
}
