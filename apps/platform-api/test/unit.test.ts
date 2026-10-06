import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyRequest } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createApp, openApiDocument } from '../src/app.js';
import { GoogleSignInIdentityVerifier, IAP_HEADER, IapIdentityVerifier } from '../src/auth/identity.js';
import { can, ROLE_PERMISSIONS } from '../src/auth/permissions.js';
import { loadConfig } from '../src/config.js';

describe('IAP identity', async () => {
  const audience = '/projects/123/global/backendServices/456';
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
  const verifier = new IapIdentityVerifier(audience, createLocalJWKSet({ keys: [jwk] }));
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuedAt()
      .setIssuer(opts.iss ?? 'https://cloud.google.com/iap').setAudience(opts.aud ?? audience).setExpirationTime(opts.exp ?? '10m').sign(privateKey);
  const req = (token?: string) => ({ headers: token ? { [IAP_HEADER]: token } : {} }) as unknown as FastifyRequest;

  it('accepts a valid IAP assertion', async () => {
    expect(await verifier.identify(req(await sign({ email: 'Ops@Yutis.test', sub: 'accounts.google.com:1' })))).toBe('ops@yutis.test');
  });

  it('rejects a missing header, another audience or issuer, an expired token and a forged signature', async () => {
    expect(await verifier.identify(req())).toBeUndefined();
    expect(await verifier.identify(req(await sign({ email: 'a@b.test' }, { aud: '/projects/999/global/backendServices/1' })))).toBeUndefined();
    expect(await verifier.identify(req(await sign({ email: 'a@b.test' }, { iss: 'https://evil.test' })))).toBeUndefined();
    expect(await verifier.identify(req(await sign({ email: 'a@b.test' }, { exp: '-1m' })))).toBeUndefined();
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({ email: 'a@b.test' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer('https://cloud.google.com/iap')
      .setAudience(audience).setExpirationTime('10m').sign(other.privateKey);
    expect(await verifier.identify(req(forged))).toBeUndefined();
  });
});

describe('Google sign-in identity (instead of IAP)', async () => {
  const project = 'yutis-care-prod';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const verifier = new GoogleSignInIdentityVerifier(project, createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] }));
  const google = { email: 'Ops@Yutis.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; key?: CryptoKey } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuedAt().setSubject('uid-1')
      .setIssuer(`https://securetoken.google.com/${opts.aud ?? project}`).setAudience(opts.aud ?? project).setExpirationTime('5m')
      .sign(opts.key ?? privateKey);
  const req = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} }) as unknown as FastifyRequest;

  it('accepts a Google sign-in with a verified email', async () => {
    expect(await verifier.identify(req(await sign(google)))).toBe('ops@yutis.test');
  });

  it("rejects customer tenants' sign-ins, other providers, unverified emails, other projects and forged tokens", async () => {
    expect(await verifier.identify(req())).toBeUndefined();
    expect(await verifier.identify(req(await sign({ ...google, firebase: { sign_in_provider: 'google.com', tenant: 'y-acme-1a2b' } })))).toBeUndefined();
    expect(await verifier.identify(req(await sign({ ...google, firebase: { sign_in_provider: 'password' } })))).toBeUndefined();
    expect(await verifier.identify(req(await sign({ ...google, email_verified: false })))).toBeUndefined();
    expect(await verifier.identify(req(await sign(google, { aud: 'someone-else' })))).toBeUndefined();
    expect(await verifier.identify(req(await sign(google, { key: (await generateKeyPair('RS256')).privateKey })))).toBeUndefined();
  });
});

describe('platform roles', () => {
  it('lets only operations onboard or suspend tenants and change subscriptions', () => {
    const who = (p: Parameters<typeof can>[1]) => Object.keys(ROLE_PERMISSIONS).filter(r => can(r as never, p));
    expect(who('tenants:write')).toEqual(['營運']);
    expect(who('subscriptions:write')).toEqual(['營運']);
    expect(who('tenants:read').sort()).toEqual(['營運', '客服', '工程'].sort());
  });
});

describe('loadConfig', () => {
  const env = { PLATFORM_DATABASE_URL: 'postgres://x/y' };

  it('requires exactly one way to identify platform staff: IAP, Google sign-in or dev sign-in', () => {
    const signIn = { PLATFORM_SIGN_IN_PROJECT_ID: 'p', PLATFORM_SIGN_IN_API_KEY: 'k', PLATFORM_SIGN_IN_AUTH_DOMAIN: 'p.firebaseapp.com' };
    expect(() => loadConfig(env)).toThrow(/IAP_AUDIENCE/);
    expect(loadConfig({ ...env, IAP_AUDIENCE: '/projects/1/global/backendServices/2' })).toMatchObject({ devAuth: false, fakeIntegrations: false });
    expect(loadConfig({ ...env, NODE_ENV: 'production', ...signIn })).toMatchObject({ signIn: { projectId: 'p', apiKey: 'k', authDomain: 'p.firebaseapp.com' } });
    expect(() => loadConfig({ ...env, PLATFORM_SIGN_IN_PROJECT_ID: 'p' })).toThrow(/go together/);
    expect(() => loadConfig({ ...env, ...signIn, IAP_AUDIENCE: 'a' })).toThrow(/exactly one/);
  });

  it('refuses dev sign-in or fake integrations in production', () => {
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', PLATFORM_DEV_AUTH: 'true' })).toThrow(/PLATFORM_DEV_AUTH/);
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', IAP_AUDIENCE: 'a', PLATFORM_FAKE_INTEGRATIONS: 'true' })).toThrow(/PLATFORM_FAKE_INTEGRATIONS/);
  });

  it('reads how trial application notices are emailed', () => {
    const dev = { ...env, PLATFORM_DEV_AUTH: 'true' };
    expect(loadConfig(dev)).toMatchObject({ email: { provider: 'log' }, trialNotifyEmails: [] });
    expect(loadConfig({ ...dev, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x', EMAIL_FROM: 'Yutis <a@b.test>', TRIAL_NOTIFY_EMAILS: ' Ops@Yutis.test, b@yutis.test ' }))
      .toMatchObject({ email: { provider: 'resend', apiKey: 're_x' }, trialNotifyEmails: ['ops@yutis.test', 'b@yutis.test'] });
    expect(() => loadConfig({ ...dev, EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(() => loadConfig({ ...dev, TRIAL_NOTIFY_EMAILS: 'not-an-address' })).toThrow(/TRIAL_NOTIFY_EMAILS/);
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
    const app = await createApp(loadConfig({ NODE_ENV: 'production', PLATFORM_DATABASE_URL: 'postgres://unused/unused', IAP_AUDIENCE: '/projects/0/global/backendServices/0' }), { logger: false });
    const doc = openApiDocument(app);
    await app.close();
    const untyped = Object.entries(doc.paths).flatMap(([path, ops]) => Object.entries(ops).flatMap(([method, op]) =>
      ((op as { parameters?: { name: string; schema?: object }[] }).parameters ?? [])
        .filter(p => !p.schema || !['type', '$ref', 'enum', 'oneOf'].some(k => k in p.schema!))
        .map(p => `${method.toUpperCase()} ${path} ${p.name}`)));
    expect(untyped).toEqual([]);
  });
});
