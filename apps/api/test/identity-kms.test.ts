/*
 * Production sign-in (Identity Platform ID tokens) and envelope encryption (Cloud KMS), with the Google endpoints
 * replaced by local fakes: a local signing key, a fake Identity Toolkit admin API and an in-memory KMS.
 */
import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createDb, tenantKeys, tenants, type TenantSummary } from '@yutis/db';
import { eq } from 'drizzle-orm';
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, importSPKI, jwtVerify, SignJWT } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityPlatformVerifier } from '../src/auth/identity.js';
import { KmsTenantCrypto } from '../src/core/crypto.js';
import { googleTokenSource, MetadataTokenSource, ServiceAccountTokenSource, type Fetch } from '../src/core/gcp.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const PROJECT = 'yutis-care-prod';
const tenant = (idpTenantId: string | null): TenantSummary => ({ id: 't1', slug: 'acme', name: 'Acme', status: 'active', idpTenantId });

describe('IdentityPlatformVerifier', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuedAt().setSubject('uid-1')
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`).setAudience(opts.aud ?? PROJECT).setExpirationTime(opts.exp ?? '5m')
      .sign(privateKey);

  const admin: Record<string, unknown> = {
    '': { enableEmailLinkSignin: true, allowPasswordSignup: false },
    '/oauthIdpConfigs': { oauthIdpConfigs: [{ name: `projects/${PROJECT}/tenants/acme-1/oauthIdpConfigs/oidc.acme`, displayName: 'Acme 公司帳號', enabled: true }] },
    '/inboundSamlConfigs': { inboundSamlConfigs: [{ name: `projects/${PROJECT}/tenants/acme-1/inboundSamlConfigs/saml.old`, displayName: '舊 SSO', enabled: false }] },
    '/defaultSupportedIdpConfigs': { defaultSupportedIdpConfigs: [{ name: `projects/${PROJECT}/tenants/acme-1/defaultSupportedIdpConfigs/microsoft.com`, enabled: true }] },
  };
  const calls: string[] = [];
  const posted: unknown[] = [];
  const fetchFn: Fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url === `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/tenants/acme-1/accounts:sendOobCode`) {
      posted.push({ auth: (init?.headers as Record<string, string>).authorization, body: JSON.parse(String(init?.body)) });
      return Response.json({ email: 'nurse@acme.test', oobLink: 'https://yutis-care-prod.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc' });
    }
    const path = url.replace(`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/tenants/acme-1`, '');
    return path in admin ? Response.json(admin[path]) : new Response('not found', { status: 404 });
  };
  const verifier = new IdentityPlatformVerifier({ projectId: PROJECT, apiKey: 'browser-key', authDomain: `${PROJECT}.firebaseapp.com`, tokens: { get: async () => 'token' }, fetchFn, keys });

  it("accepts a token from the tenant's own Identity Platform tenant", async () => {
    const token = await sign({ firebase: { tenant: 'acme-1' }, email: 'Nurse@Acme.test', email_verified: true });
    expect(await verifier.verify(token, tenant('acme-1'))).toEqual({
      issuer: `https://securetoken.google.com/${PROJECT}/acme-1`, subject: 'uid-1', email: 'Nurse@Acme.test', phone: undefined,
    });
  });

  it("refuses a token from another customer's tenant, another project, or expired", async () => {
    expect(await verifier.verify(await sign({ firebase: { tenant: 'globex-1' } }), tenant('acme-1'))).toBeUndefined();
    expect(await verifier.verify(await sign({ firebase: {} }), tenant('acme-1'))).toBeUndefined();
    expect(await verifier.verify(await sign({ firebase: { tenant: 'acme-1' } }, { aud: 'other' }), tenant('acme-1'))).toBeUndefined();
    expect(await verifier.verify(await sign({ firebase: { tenant: 'acme-1' } }, { iss: 'https://securetoken.google.com/other' }), tenant('acme-1'))).toBeUndefined();
    expect(await verifier.verify(await sign({ firebase: { tenant: 'acme-1' } }, { exp: '-1m' }), tenant('acme-1'))).toBeUndefined();
    expect(await verifier.verify('not-a-jwt', tenant('acme-1'))).toBeUndefined();
    expect(await verifier.verify(await sign({ firebase: { tenant: 'acme-1' } }), tenant(null))).toBeUndefined();
  });

  it('ignores an email the provider did not verify', async () => {
    const token = await sign({ firebase: { tenant: 'acme-1' }, email: 'x@acme.test', email_verified: false, phone_number: '+886900000001' });
    expect(await verifier.verify(token, tenant('acme-1'))).toMatchObject({ email: undefined, phone: '+886900000001' });
  });

  it("reads the tenant's enabled providers for the sign-in page, and caches them", async () => {
    calls.length = 0;
    expect(await verifier.loginMethods(tenant('acme-1'))).toEqual(['sso', 'email_otp']);
    expect(await verifier.signInConfig(tenant('acme-1'))).toEqual({
      apiKey: 'browser-key', authDomain: `${PROJECT}.firebaseapp.com`, tenantId: 'acme-1',
      providers: [{ id: 'oidc.acme', label: 'Acme 公司帳號' }, { id: 'microsoft.com', label: 'Microsoft' }],
    });
    expect(calls).toHaveLength(4);
    expect(await verifier.signInConfig(tenant(null))).toBeNull();
    expect(await verifier.loginMethods(tenant(null))).toEqual([]);
  });

  it('asks Identity Platform for a sign-in link without having it send the email', async () => {
    expect(await verifier.signInLink(tenant('acme-1'), 'nurse@acme.test', 'https://acme.care.test/login'))
      .toBe('https://yutis-care-prod.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc');
    expect(posted).toEqual([{ auth: 'Bearer token', body: {
      requestType: 'EMAIL_SIGNIN', email: 'nurse@acme.test', continueUrl: 'https://acme.care.test/login', canHandleCodeInApp: true, returnOobLink: true, tenantId: 'acme-1',
    } }]);
    expect(await verifier.signInLink(tenant(null), 'nurse@acme.test', 'https://acme.care.test/login')).toBeNull();
  });
});

/** In-memory Cloud KMS: AES-GCM under one key per KMS key name, binding the additional authenticated data. */
class FakeKms {
  private readonly keys = new Map<string, Buffer>();
  encrypts = 0;
  decrypts = 0;

  private key(name: string) {
    if (!this.keys.has(name)) this.keys.set(name, randomBytes(32));
    return this.keys.get(name)!;
  }

  async encrypt(name: string, plaintext: Buffer, aad: Buffer) {
    this.encrypts++;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key(name), iv).setAAD(aad);
    const body = Buffer.concat([c.update(plaintext), c.final()]);
    return { ciphertext: Buffer.concat([iv, c.getAuthTag(), body]), keyVersion: `${name}/cryptoKeyVersions/1` };
  }

  async decrypt(name: string, ciphertext: Buffer, aad: Buffer) {
    this.decrypts++;
    const d = createDecipheriv('aes-256-gcm', this.key(name), ciphertext.subarray(0, 12)).setAAD(aad);
    d.setAuthTag(ciphertext.subarray(12, 28));
    return Buffer.concat([d.update(ciphertext.subarray(28)), d.final()]);
  }

  destroy(name: string) {
    this.keys.set(name, randomBytes(32));
  }
}

describe('KmsTenantCrypto', () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  const T: Record<string, string> = {};
  const kms = new FakeKms();

  beforeAll(async () => {
    db = await createTestDatabase();
    for (const slug of ['acme', 'globex', 'nokey']) {
      const [t] = await db.owner.insert(tenants).values({ slug, name: slug, kmsKeyName: slug === 'nokey' ? null : `projects/p/locations/asia-east1/keyRings/tenants/cryptoKeys/${slug}` }).returning();
      T[slug] = t!.id;
    }
    pool = new pg.Pool({ connectionString: db.appUrl, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it('creates a wrapped data key on first use and reads it back in another process', async () => {
    const crypto = new KmsTenantCrypto(createDb(pool), kms);
    const data = await crypto.encrypt(T.acme!, '病史：高血壓');
    const stored = await db.owner.select().from(tenantKeys).where(eq(tenantKeys.tenantId, T.acme!));
    expect(stored.map(k => k.purpose)).toEqual(['data']);
    expect(stored[0]!.kmsKeyVersion).toMatch(/cryptoKeys\/acme\/cryptoKeyVersions\/1$/);

    const restarted = new KmsTenantCrypto(createDb(pool), kms);
    const decryptsBefore = kms.decrypts;
    expect(await restarted.decrypt(T.acme!, data)).toBe('病史：高血壓');
    expect(await restarted.decrypt(T.acme!, data)).toBe('病史：高血壓');
    expect(kms.decrypts - decryptsBefore).toBe(1);
  });

  it("keeps tenants' keys apart, also for fingerprints", async () => {
    const crypto = new KmsTenantCrypto(createDb(pool), kms);
    const data = await crypto.encrypt(T.acme!, 'secret');
    await expect(crypto.decrypt(T.globex!, data)).rejects.toThrow();
    expect(await crypto.fingerprint(T.acme!, 'A123456789')).not.toBe(await crypto.fingerprint(T.globex!, 'A123456789'));
    expect(await crypto.fingerprint(T.acme!, 'A123456789')).toBe(await new KmsTenantCrypto(createDb(pool), kms).fingerprint(T.acme!, 'A123456789'));
  });

  it('creates one key even when two processes start at the same moment', async () => {
    const [a, b] = [new KmsTenantCrypto(createDb(pool), kms), new KmsTenantCrypto(createDb(pool), kms)];
    const [x, y] = await Promise.all([a.encrypt(T.globex!, 'one'), b.encrypt(T.globex!, 'two')]);
    expect(await b.decrypt(T.globex!, x)).toBe('one');
    expect(await a.decrypt(T.globex!, y)).toBe('two');
  });

  it('answers 503 for a tenant without a KMS key', async () => {
    await expect(new KmsTenantCrypto(createDb(pool), kms).encrypt(T.nokey!, 'x')).rejects.toMatchObject({ status: 503 });
  });

  it("makes the tenant's data unreadable once its KMS key is destroyed", async () => {
    const data = await new KmsTenantCrypto(createDb(pool), kms).encrypt(T.acme!, 'secret');
    kms.destroy(`projects/p/locations/asia-east1/keyRings/tenants/cryptoKeys/acme`);
    await expect(new KmsTenantCrypto(createDb(pool), kms).decrypt(T.acme!, data)).rejects.toThrow();
  });
});

describe('ServiceAccountTokenSource', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyJson = JSON.stringify({
    type: 'service_account', client_email: 'yutis-api@p.iam.gserviceaccount.com', token_uri: 'https://oauth2.googleapis.com/token',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });

  it('exchanges a JWT signed with the key for an access token, and caches it', async () => {
    const calls: URLSearchParams[] = [];
    const fetchFn: Fetch = async (_url, init) => {
      calls.push(new URLSearchParams(String(init?.body)));
      return new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }));
    };
    const source = new ServiceAccountTokenSource(keyJson, fetchFn);
    expect(await source.get()).toBe('ya29.token');
    expect(await source.get()).toBe('ya29.token');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = calls[0]!.get('assertion')!;
    const spki = await importSPKI(publicKey.export({ type: 'spki', format: 'pem' }).toString(), 'RS256');
    await jwtVerify(assertion, spki, { issuer: 'yutis-api@p.iam.gserviceaccount.com', audience: 'https://oauth2.googleapis.com/token' });
    expect(decodeJwt(assertion).scope).toBe('https://www.googleapis.com/auth/cloud-platform');
  });

  it('is used only when a key is configured', () => {
    expect(googleTokenSource({ GOOGLE_SERVICE_ACCOUNT_KEY: keyJson })).toBeInstanceOf(ServiceAccountTokenSource);
    expect(googleTokenSource({})).toBeInstanceOf(MetadataTokenSource);
    expect(() => googleTokenSource({ GOOGLE_SERVICE_ACCOUNT_KEY: '{}' })).toThrow(/service account JSON key/);
  });
});
