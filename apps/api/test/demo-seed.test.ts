import { legalEntities, tenants, users } from '@yutis/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_COMPANY_NAME, DEMO_TENANT_SLUG, seedDemoTenant } from '../src/demo-seed.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db?.drop(); });

describe('demo tenant seed', () => {
  it('creates the demo tenant once, and later only brings its company name up to date', async () => {
    expect(await seedDemoTenant(db.owner)).toBe(true);
    const [t] = await db.owner.select().from(tenants).where(eq(tenants.slug, DEMO_TENANT_SLUG));
    expect(t!.name).toBe('Your Company');
    const staff = (await db.owner.select().from(users).where(eq(users.tenantId, t!.id))).length;

    await db.owner.update(tenants).set({ name: '示範科技股份有限公司' }).where(eq(tenants.id, t!.id));
    await db.owner.update(legalEntities).set({ name: '示範科技股份有限公司' }).where(eq(legalEntities.tenantId, t!.id));
    expect(await seedDemoTenant(db.owner)).toBe(false);
    expect((await db.owner.select().from(tenants).where(eq(tenants.id, t!.id)))[0]!.name).toBe(DEMO_COMPANY_NAME);
    expect((await db.owner.select().from(legalEntities).where(eq(legalEntities.tenantId, t!.id))).map(l => l.name)).toEqual([DEMO_COMPANY_NAME]);
    expect(await db.owner.select().from(users).where(eq(users.tenantId, t!.id))).toHaveLength(staff);
  });
});
