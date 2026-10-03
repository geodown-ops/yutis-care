/*
 * Local development only: creates the API's login role and a fictional "demo" tenant to sign in to
 * (http://demo.localhost:3000). Runs as the table owner (DATABASE_URL). Idempotent. Never point it at a real database.
 */
import { createDb, departments, employees, legalEntities, sites, tenants, users, userSiteScopes } from '@yutis/db';
import { eq } from 'drizzle-orm';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (the table owner, as for db:migrate) is required');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = createDb(pool);

await pool.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_api_local') THEN
    CREATE ROLE yutis_api_local LOGIN PASSWORD 'yutis_api_local' IN ROLE yutis_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_worker_local') THEN
    CREATE ROLE yutis_worker_local LOGIN PASSWORD 'yutis_worker_local' IN ROLE yutis_worker;
  END IF;
END $$`);

const [existing] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
if (existing) {
  console.log('Tenant "demo" already exists; nothing to do.');
} else {
  await db.transaction(async tx => {
    const [t] = await tx.insert(tenants).values({ slug: 'demo', name: '示範科技股份有限公司' }).returning();
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
  console.log('Created tenant "demo" with staff nurse@, doctor@, safety@, hr@, manager@, admin@demo.test and employees E001–E003.');
}
await pool.end();
