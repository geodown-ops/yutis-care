/*
 * The platform API against a real PostgreSQL, logged in as a member of yutis_platform. External services (KMS,
 * Identity Platform, email) are recording fakes, so onboarding's undo steps can be checked.
 */
import { Controller, Module, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  announcements, departments, employees, gradingRules, legalEntities, phrases, platformAuditLog, platformUsers, plans, sites,
  tenants, tenantSettings, tenantSubscriptions, usageCounters, users, type Db,
} from '@yutis/db';
import { RULES_V1 } from '@yutis/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule, createApp } from '../src/app.js';
import { Requires } from '../src/auth/access.js';
import { loadConfig } from '../src/config.js';
import { Ctx, type RequestContext } from '../src/core/context.js';
import type { IdentityTenantService, Invitation, InvitationMailer, TenantKeyService } from '../src/integrations/integrations.js';
import { DEFAULT_PHRASES } from '../src/templates/defaults.js';
import { syncDefaultTemplates } from '../src/templates/templates.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

class RecordingKeys implements TenantKeyService {
  created: string[] = []; destroyed: string[] = [];
  async createKey(slug: string) { const name = `key-${slug}`; this.created.push(name); return name; }
  async destroyKey(name: string) { this.destroyed.push(name); }
}
class RecordingIdentityTenants implements IdentityTenantService {
  created: string[] = []; deleted: string[] = []; fail = false;
  async createTenant(slug: string) { if (this.fail) throw new Error('Identity Platform unavailable'); const id = `idp-${slug}`; this.created.push(id); return id; }
  async deleteTenant(id: string) { this.deleted.push(id); }
}
class RecordingMailer implements InvitationMailer {
  sent: Invitation[] = []; fail = false;
  async sendTenantAdminInvitation(i: Invitation) { if (this.fail) throw new Error('mail server down'); this.sent.push(i); }
}

@Controller('probe')
class ProbeController {
  /** A write that forgets its audit entry: must be refused and rolled back. */
  @Post('unaudited')
  @Requires('announcements:write')
  async unaudited(@Ctx() ctx: RequestContext) {
    await ctx.tx.insert(announcements).values({ title: 'probe-unaudited', body: 'x' });
    return { ok: true };
  }
}

let db: TestDatabase;
let owner: Db;
let app: NestFastifyApplication;
const keys = new RecordingKeys(), idp = new RecordingIdentityTenants(), mailer = new RecordingMailer();
let acmeId = '';
let engId = '';

const OPS = 'ops@yutis.test', SUPPORT = 'support@yutis.test', ENG = 'eng@yutis.test';

function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, as?: string, body?: unknown) {
  return app.inject({
    method, url: `/platform-api${url}`,
    headers: as ? { 'x-dev-platform-user': as } : {},
    ...(body === undefined ? {} : { payload: body as object }),
  });
}

const onboardBody = (subdomain: string, extra: Record<string, unknown> = {}) => ({
  subdomain, name: `${subdomain} 股份有限公司`, planCode: 'standard', seatLimit: 300,
  admin: { email: `Admin@${subdomain}.test`, name: '陳管理員' }, ...extra,
});

const auditActions = async () => (await owner.select({ action: platformAuditLog.action }).from(platformAuditLog)).map(r => r.action);

beforeAll(async () => {
  db = await createTestDatabase();
  owner = db.owner;
  const [, , eng] = await owner.insert(platformUsers).values([
    { email: OPS, name: '營運小王', role: '營運' },
    { email: SUPPORT, name: '客服小李', role: '客服' },
    { email: ENG, name: '工程小陳', role: '工程' },
    { email: 'gone@yutis.test', name: '離職', role: '營運', active: false },
  ]).returning();
  engId = eng!.id;
  await owner.insert(plans).values({ code: 'standard', name: '標準方案' });
  await owner.transaction(tx => syncDefaultTemplates(tx, null));
  const [acme] = await owner.insert(tenants).values({ slug: 'acme', name: 'Acme 股份有限公司' }).returning();
  acmeId = acme!.id;
  const [le] = await owner.insert(legalEntities).values({ tenantId: acmeId, code: 'L1', name: 'Acme' }).returning();
  const [site] = await owner.insert(sites).values({ tenantId: acmeId, legalEntityId: le!.id, code: 'S1', name: '桃園廠' }).returning();
  const [dept] = await owner.insert(departments).values({ tenantId: acmeId, siteId: site!.id, name: '製造課' }).returning();
  const emp = (empNo: string, status: '在職' | '離職') => ({
    tenantId: acmeId, empNo, name: empNo, sex: '女' as const, birthDate: '1990-01-01', legalEntityId: le!.id, siteId: site!.id, departmentId: dept!.id, status,
  });
  await owner.insert(employees).values([emp('E1', '在職'), emp('E2', '在職'), emp('E3', '離職')]);
  await owner.insert(usageCounters).values({ tenantId: acmeId, period: '2026-10-01', metric: 'sms_sent', quantity: 42 });

  const config = loadConfig({ NODE_ENV: 'test', PLATFORM_DATABASE_URL: db.platformUrl, PLATFORM_DEV_AUTH: 'true', TENANT_BASE_DOMAIN: 'care.test' });
  @Module({ imports: [AppModule.forRoot(config, { integrations: { keys, identityTenants: idp, invitations: mailer } })], controllers: [ProbeController] })
  class TestRoot {}
  app = await createApp(config, { module: { module: TestRoot }, logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await db?.drop();
});

beforeEach(() => {
  idp.fail = false;
  mailer.fail = false;
});

describe('sign-in', () => {
  it('answers health checks without sign-in', async () => {
    expect((await call('GET', '/health')).json()).toEqual({ status: 'ok' });
  });

  it('requires a verified identity and an active platform account', async () => {
    expect((await call('GET', '/tenants')).statusCode).toBe(401);
    const stranger = await call('GET', '/tenants', 'someone@gmail.test');
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toMatchObject({ code: 'not_platform_user' });
    expect((await call('GET', '/tenants', 'gone@yutis.test')).statusCode).toBe(403);
    expect((await call('GET', '/tenants', SUPPORT)).statusCode).toBe(200);
  });

  it('applies role permissions', async () => {
    expect((await call('POST', '/tenants', SUPPORT, onboardBody('nope'))).statusCode).toBe(403);
    expect((await call('POST', '/tenants', ENG, onboardBody('nope'))).statusCode).toBe(403);
    expect((await call('GET', '/platform-users', OPS)).statusCode).toBe(403);
    expect((await call('GET', '/platform-users', ENG)).statusCode).toBe(200);
  });
});

describe('tenants', () => {
  it('lists tenants with counts only', async () => {
    const list = (await call('GET', '/tenants', SUPPORT)).json();
    expect(list.find((t: { subdomain: string }) => t.subdomain === 'acme')).toMatchObject({
      id: acmeId, url: 'https://acme.care.test', status: 'active', activeEmployees: 2, subscription: null, overSeatLimit: false,
    });
  });

  it('onboards a tenant: key, sign-in tenant, subscription, templates, first admin, invitation and audit', async () => {
    const res = await call('POST', '/tenants', OPS, onboardBody('newco'));
    expect(res.statusCode, res.body).toBe(201);
    const t = res.json();
    expect(t).toMatchObject({
      subdomain: 'newco', url: 'https://newco.care.test', status: 'active', encryptionKeyReady: true, signInTenantReady: true, staffAccounts: 1,
      admins: [{ name: '陳管理員', email: 'admin@newco.test', active: true, lastSignInAt: null }],
      subscription: { planCode: 'standard', status: 'trial', seatLimit: 300, endsOn: null },
    });
    const [row] = await owner.select().from(tenants).where(eq(tenants.id, t.id));
    expect(row).toMatchObject({ kmsKeyName: 'key-newco', idpTenantId: 'idp-newco' });
    expect(await owner.select().from(gradingRules).where(eq(gradingRules.tenantId, t.id))).toHaveLength(RULES_V1.length);
    expect(await owner.select().from(phrases).where(eq(phrases.tenantId, t.id))).toHaveLength(DEFAULT_PHRASES.length);
    expect((await owner.select().from(tenantSettings).where(eq(tenantSettings.tenantId, t.id))).map(s => s.key).sort()).toEqual(['sign_off_roles', 'survey_versions']);
    expect(await owner.select({ email: users.email, role: users.role }).from(users).where(eq(users.tenantId, t.id))).toEqual([{ email: 'admin@newco.test', role: '租戶管理員' }]);
    expect(mailer.sent.at(-1)).toEqual({ email: 'admin@newco.test', name: '陳管理員', tenantName: 'newco 股份有限公司', tenantUrl: 'https://newco.care.test', idpTenantId: 'idp-newco' });
    const [audit] = await owner.select().from(platformAuditLog).where(eq(platformAuditLog.action, 'tenant.onboard'));
    expect(audit).toMatchObject({ tenantId: t.id, actorEmail: OPS, detail: expect.objectContaining({ subdomain: 'newco', plan: 'standard' }) });
  });

  it('refuses taken, reserved and malformed subdomains and unknown plans', async () => {
    const taken = await call('POST', '/tenants', OPS, onboardBody('acme'));
    expect([taken.statusCode, taken.json().code]).toEqual([409, 'subdomain_taken']);
    for (const subdomain of ['admin', 'www', 'demo', 'a.b', '-x']) {
      const res = await call('POST', '/tenants', OPS, onboardBody(subdomain, { admin: { email: 'boss@example.test', name: '老闆' } }));
      expect([res.statusCode, res.json().code]).toEqual([400, 'invalid_subdomain']);
    }
    const plan = await call('POST', '/tenants', OPS, onboardBody('planless', { planCode: 'gold' }));
    expect([plan.statusCode, plan.json().code]).toEqual([400, 'unknown_plan']);
    expect(keys.created.filter(k => ['key-acme', 'key-admin', 'key-planless'].includes(k))).toEqual([]);
  });

  it('undoes everything when the invitation email fails', async () => {
    mailer.fail = true;
    const before = await auditActions();
    const res = await call('POST', '/tenants', OPS, onboardBody('failco'));
    expect(res.statusCode).toBe(500);
    expect(await owner.select().from(tenants).where(eq(tenants.slug, 'failco'))).toHaveLength(0);
    expect(await owner.select().from(users).where(eq(users.email, 'admin@failco.test'))).toHaveLength(0);
    expect(keys.destroyed).toContain('key-failco');
    expect(idp.deleted).toContain('idp-failco');
    expect(await auditActions()).toEqual(before);
  });

  it('undoes the KMS key when the Identity Platform tenant cannot be created', async () => {
    idp.fail = true;
    expect((await call('POST', '/tenants', OPS, onboardBody('idpfail'))).statusCode).toBe(500);
    expect(keys.created).toContain('key-idpfail');
    expect(keys.destroyed).toContain('key-idpfail');
    expect(await owner.select().from(tenants).where(eq(tenants.slug, 'idpfail'))).toHaveLength(0);
  });

  it('suspends and reactivates, with audit', async () => {
    const suspended = await call('POST', `/tenants/${acmeId}/suspend`, OPS, { reason: '逾期未付款' });
    expect(suspended.json()).toMatchObject({ status: 'suspended' });
    expect((await call('POST', `/tenants/${acmeId}/suspend`, OPS, { reason: 'again' })).json()).toMatchObject({ code: 'tenant_status' });
    expect((await call('POST', `/tenants/${acmeId}/reactivate`, OPS)).json()).toMatchObject({ status: 'active' });
    expect(await auditActions()).toEqual(expect.arrayContaining(['tenant.suspend', 'tenant.reactivate']));
    expect((await call('POST', `/tenants/${acmeId}/suspend`, SUPPORT, { reason: 'x' })).statusCode).toBe(403);
  });

  it('sets the subscription and flags seat limits without blocking', async () => {
    const res = await call('PUT', `/tenants/${acmeId}/subscription`, OPS, { planCode: 'standard', status: 'active', seatLimit: 1, startsOn: '2026-10-01', endsOn: null });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ subscription: { status: 'active', seatLimit: 1 }, overSeatLimit: true });
    await call('PUT', `/tenants/${acmeId}/subscription`, OPS, { planCode: 'standard', status: 'active', seatLimit: 500, startsOn: '2026-10-01', endsOn: null });
    expect(await owner.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, acmeId))).toHaveLength(1);
    expect((await call('PUT', `/tenants/${acmeId}/subscription`, OPS, { planCode: 'standard', status: 'active', seatLimit: 5, startsOn: '2026-10-01', endsOn: '2026-09-01' })).statusCode).toBe(400);
  });

  it('reports usage as counts per tenant', async () => {
    const usage = (await call('GET', '/usage?month=2026-10', SUPPORT)).json();
    expect(usage.find((u: { tenantId: string }) => u.tenantId === acmeId)).toMatchObject({ activeEmployees: 2, smsSent: 42, examsInMonth: 0 });
    expect((await call('GET', '/usage?month=2026-13', SUPPORT)).statusCode).toBe(400);
  });
});

describe('announcements, platform users, templates', () => {
  it('manages announcements with audit', async () => {
    const created = await call('POST', '/announcements', SUPPORT, { title: '10/12 系統維護', body: '02:00–04:00 暫停服務', kind: 'maintenance' });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    expect((await call('PATCH', `/announcements/${id}`, OPS, { title: '10/12 系統維護（延長）' })).json()).toMatchObject({ title: '10/12 系統維護（延長）' });
    expect((await call('DELETE', `/announcements/${id}`, OPS)).statusCode).toBe(204);
    expect((await call('POST', '/announcements', ENG, { title: 'x', body: 'y' })).statusCode).toBe(403);
    expect(await auditActions()).toEqual(expect.arrayContaining(['announcement.create', 'announcement.update', 'announcement.delete']));
  });

  it('manages platform users, but not oneself', async () => {
    const created = await call('POST', '/platform-users', ENG, { email: 'New@Yutis.test', name: '新人', role: '客服' });
    expect(created.json()).toMatchObject({ email: 'new@yutis.test', role: '客服', active: true });
    expect((await call('POST', '/platform-users', ENG, { email: 'new@yutis.test', name: '重複', role: '客服' })).statusCode).toBe(409);
    expect((await call('PATCH', `/platform-users/${created.json().id}`, ENG, { active: false })).json()).toMatchObject({ active: false });
    expect((await call('PATCH', `/platform-users/${engId}`, ENG, { active: false })).json()).toMatchObject({ code: 'cannot_change_self' });
  });

  it('syncs default templates only when they changed', async () => {
    const res = await call('POST', '/templates/sync', OPS);
    expect(res.json().every((r: { changed: boolean; version: number }) => !r.changed && r.version === 1)).toBe(true);
    expect((await call('GET', '/templates', SUPPORT)).json()).toHaveLength(4);
  });

  it('rolls back any write that skipped the platform audit log', async () => {
    expect((await call('POST', '/probe/unaudited', OPS)).statusCode).toBe(500);
    expect(await owner.select().from(announcements).where(eq(announcements.title, 'probe-unaudited'))).toHaveLength(0);
  });
});
