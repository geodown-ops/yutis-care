/*
 * The fictional "demo" tenant (示範科技): two sites, three employees and one account per staff role. Used by the local
 * seed (`pnpm --filter @yutis/api db:seed`) and by the release job on the demo site. Never run against a database that
 * holds real data. Idempotent: does nothing if the tenant exists.
 */
import { departments, employees, legalEntities, sites, tenants, users, userSiteScopes, type Db } from '@yutis/db';
import { eq } from 'drizzle-orm';

export const DEMO_TENANT_SLUG = 'demo';

/** Runs as the table owner. Returns false if the tenant already existed. */
export async function seedDemoTenant(db: Db): Promise<boolean> {
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, DEMO_TENANT_SLUG));
  if (existing) return false;
  await db.transaction(async tx => {
    const [t] = await tx.insert(tenants).values({ slug: DEMO_TENANT_SLUG, name: '示範科技股份有限公司' }).returning();
    const tenantId = t!.id;
    const [le] = await tx.insert(legalEntities).values({ tenantId, code: 'DEMO', name: '示範科技股份有限公司' }).returning();
    const [s1, s2] = await tx.insert(sites).values([
      { tenantId, legalEntityId: le!.id, code: 'TY', name: '桃園廠' },
      { tenantId, legalEntityId: le!.id, code: 'HC', name: '新竹廠' },
    ]).returning();
    const [d1, d2] = await tx.insert(departments).values([
      { tenantId, siteId: s1!.id, code: 'MFG1', name: '製造一課', managerName: '周課長', managerEmail: 'manager@demo.test' },
      { tenantId, siteId: s2!.id, code: 'RD', name: '研發部' },
    ]).returning();
    const emp = (empNo: string, name: string, sex: '男' | '女', birthDate: string, site: typeof s1, dept: typeof d1, phone: string) => ({
      tenantId, empNo, name, sex, birthDate, legalEntityId: le!.id, siteId: site!.id, departmentId: dept!.id,
      email: `${empNo.toLowerCase()}@demo.test`, phone,
    });
    await tx.insert(employees).values([
      emp('E001', '林小美', '女', '1991-04-12', s1, d1, '0900000001'),
      emp('E002', '陳大文', '男', '1978-11-03', s1, d1, '0900000002'),
      emp('E003', '黃怡君', '女', '1995-07-21', s2, d2, '0900000003'),
    ]);
    const staff = await tx.insert(users).values([
      { tenantId, email: 'nurse@demo.test', name: '王護理師', role: '職護' },
      { tenantId, email: 'doctor@demo.test', name: '張醫師', role: '職醫' },
      { tenantId, email: 'safety@demo.test', name: '吳工安', role: '職安衛人員' },
      { tenantId, email: 'hr@demo.test', name: '李人資', role: '人資' },
      { tenantId, email: 'manager@demo.test', name: '周課長', role: '部門主管' },
      { tenantId, email: 'admin@demo.test', name: '陳管理員', role: '租戶管理員' },
    ]).returning();
    const by = (email: string) => staff.find(u => u.email === email)!.id;
    await tx.insert(userSiteScopes).values([
      { tenantId, userId: by('nurse@demo.test'), siteId: s1!.id },
      { tenantId, userId: by('doctor@demo.test'), siteId: s1!.id },
      { tenantId, userId: by('doctor@demo.test'), siteId: s2!.id },
      { tenantId, userId: by('safety@demo.test'), siteId: s1!.id },
      { tenantId, userId: by('hr@demo.test'), siteId: s1!.id },
    ]);
  });
  return true;
}
