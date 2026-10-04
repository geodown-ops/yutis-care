import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApp, openApiDocument } from '../src/app.js';
import { allows } from '../src/auth/access.guard.js';
import { ROLE_ACCESS } from '../src/auth/permissions.js';
import { loadConfig } from '../src/config.js';
import type { StaffPrincipal } from '../src/core/context.js';
import { LocalTenantCrypto } from '../src/core/crypto.js';
import { tenantSlugFromHost } from '../src/core/host.js';

describe('tenantSlugFromHost', () => {
  const base = 'care.yutis.com.tw';

  it('takes the single label in front of the product domain', () => {
    expect(tenantSlugFromHost('acme.care.yutis.com.tw', base)).toBe('acme');
    expect(tenantSlugFromHost('ACME.Care.Yutis.com.tw:443', base)).toBe('acme');
    expect(tenantSlugFromHost('acme-2.care.yutis.com.tw.', base)).toBe('acme-2');
    // The demo deployment serves its own tenant called demo; only the platform refuses to give that name away.
    expect(tenantSlugFromHost('demo.care.yutis.com.tw', base)).toBe('demo');
  });

  it.each([
    'care.yutis.com.tw', 'admin.care.yutis.com.tw', 'api.care.yutis.com.tw', 'www.care.yutis.com.tw',
    'a.b.care.yutis.com.tw', 'acme.yutis.com.tw', 'acmecare.yutis.com.tw', '-acme.care.yutis.com.tw', '', 'localhost',
  ])('rejects %s', host => {
    expect(tenantSlugFromHost(host, base)).toBeNull();
  });
});

describe('role access', () => {
  const as = (role: StaffPrincipal['role']): StaffPrincipal => ({ kind: 'staff', sessionId: 's', userId: 'u', name: 'n', email: 'e', role });

  it('keeps health and medical data with occupational health staff', () => {
    for (const role of ['職醫', '職護'] as const) expect(allows({ kind: 'staff', data: 'medical' }, as(role))).toBe(true);
    for (const role of ['職安衛人員', '人資', '部門主管', '租戶管理員'] as const) {
      expect(allows({ kind: 'staff', data: 'health' }, as(role))).toBe(false);
      expect(allows({ kind: 'staff', data: 'medical' }, as(role))).toBe(false);
    }
  });

  it('gives tenant administration only to tenant admins', () => {
    const admins = Object.entries(ROLE_ACCESS).filter(([, a]) => a.features.includes('tenant-admin')).map(([r]) => r);
    expect(admins).toEqual(['租戶管理員']);
  });

  it('never lets an employee into staff routes', () => {
    expect(allows({ kind: 'staff' }, { kind: 'employee', sessionId: 's', employeeId: 'e', name: 'n', lang: 'zh' })).toBe(false);
  });
});

describe('loadConfig', () => {
  const env = { APP_DATABASE_URL: 'postgres://x/y' };

  it('defaults to secure production settings', () => {
    expect(loadConfig(env)).toMatchObject({ cookieSecure: true, devSignIn: false, tenantBaseDomain: 'care.yutis.com.tw', sessionIdleSeconds: 900 });
  });

  it('refuses dev sign-in or insecure cookies in production', () => {
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', AUTH_DEV_SIGN_IN: 'true' })).toThrow(/AUTH_DEV_SIGN_IN/);
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('allows dev sign-in and the local key on the demo site only', () => {
    const demo = { ...env, NODE_ENV: 'production', AUTH_DEV_SIGN_IN: 'true', TENANT_CRYPTO_LOCAL_KEY: randomBytes(32).toString('base64') };
    expect(loadConfig({ ...demo, DEMO_SITE: 'true' })).toMatchObject({ production: true, demoSite: true, devSignIn: true });
    expect(() => loadConfig(demo)).toThrow(/AUTH_DEV_SIGN_IN/);
    expect(() => loadConfig({ ...demo, DEMO_SITE: 'true', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('configures Identity Platform and Cloud KMS for production, and refuses mixing them with local shortcuts', () => {
    const ip = { IDENTITY_PLATFORM_PROJECT_ID: 'p', IDENTITY_PLATFORM_API_KEY: 'k', IDENTITY_PLATFORM_AUTH_DOMAIN: 'p.firebaseapp.com' };
    expect(loadConfig({ ...env, NODE_ENV: 'production', TENANT_CRYPTO_KMS: 'true', ...ip })).toMatchObject({
      cryptoKms: true, identityPlatform: { projectId: 'p', apiKey: 'k', authDomain: 'p.firebaseapp.com' },
    });
    expect(() => loadConfig({ ...env, IDENTITY_PLATFORM_PROJECT_ID: 'p' })).toThrow(/IDENTITY_PLATFORM_API_KEY/);
    expect(() => loadConfig({ ...env, ...ip, AUTH_DEV_SIGN_IN: 'true' })).toThrow(/either AUTH_DEV_SIGN_IN/);
    expect(() => loadConfig({ ...env, TENANT_CRYPTO_KMS: 'true', TENANT_CRYPTO_LOCAL_KEY: randomBytes(32).toString('base64') })).toThrow(/either TENANT_CRYPTO_LOCAL_KEY/);
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({})).toThrow(/APP_DATABASE_URL/);
  });
});

describe('LocalTenantCrypto', () => {
  const crypto = new LocalTenantCrypto(randomBytes(32));
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';

  it('round-trips, with a fresh IV each time', async () => {
    const one = await crypto.encrypt(a, '病史：高血壓');
    const two = await crypto.encrypt(a, '病史：高血壓');
    expect(one.equals(two)).toBe(false);
    expect(await crypto.decrypt(a, one)).toBe('病史：高血壓');
  });

  it("cannot be read with another tenant's key, or after tampering", async () => {
    const data = await crypto.encrypt(a, 'secret');
    await expect(crypto.decrypt(b, data)).rejects.toThrow();
    const tampered = Buffer.from(data);
    tampered[tampered.length - 1]! ^= 1;
    await expect(crypto.decrypt(a, tampered)).rejects.toThrow();
  });

  it('fingerprints values per tenant', async () => {
    expect(await crypto.fingerprint(a, 'A123456789')).toBe(await crypto.fingerprint(a, 'A123456789'));
    expect(await crypto.fingerprint(a, 'A123456789')).not.toBe(await crypto.fingerprint(b, 'A123456789'));
  });

  it('is refused in production', () => {
    expect(() => loadConfig({ APP_DATABASE_URL: 'postgres://x/y', NODE_ENV: 'production', TENANT_CRYPTO_LOCAL_KEY: randomBytes(32).toString('base64') })).toThrow(/TENANT_CRYPTO_LOCAL_KEY/);
    expect(() => loadConfig({ APP_DATABASE_URL: 'postgres://x/y', TENANT_CRYPTO_LOCAL_KEY: randomBytes(16).toString('base64') })).toThrow(/32 bytes/);
  });
});

describe('OpenAPI contract', () => {
  it('names every class once, since Swagger keys schemas by class name and silently keeps one of two', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url));
    const names = readdirSync(src, { recursive: true }).map(String).filter(f => f.endsWith('.ts'))
      .flatMap(f => [...readFileSync(join(src, f), 'utf8').matchAll(/^(?:export )?class (\w+)/gm)].map(m => m[1]!));
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('declares a type for every parameter', async () => {
    const app = await createApp(loadConfig({ NODE_ENV: 'production', APP_DATABASE_URL: 'postgres://unused/unused' }), { logger: false });
    const doc = openApiDocument(app);
    await app.close();
    const untyped = Object.entries(doc.paths).flatMap(([path, ops]) => Object.entries(ops).flatMap(([method, op]) =>
      ((op as { parameters?: { name: string; schema?: object }[] }).parameters ?? [])
        .filter(p => !p.schema || !['type', '$ref', 'enum', 'oneOf'].some(k => k in p.schema!))
        .map(p => `${method.toUpperCase()} ${path} ${p.name}`)));
    expect(untyped).toEqual([]);
  });
});
