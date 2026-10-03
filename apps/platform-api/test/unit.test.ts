import type { FastifyRequest } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { IAP_HEADER, IapIdentityVerifier } from '../src/auth/identity.js';
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

  it('requires the IAP audience unless dev sign-in is on', () => {
    expect(() => loadConfig(env)).toThrow(/IAP_AUDIENCE/);
    expect(loadConfig({ ...env, IAP_AUDIENCE: '/projects/1/global/backendServices/2' })).toMatchObject({ devAuth: false, fakeIntegrations: false });
  });

  it('refuses dev sign-in or fake integrations in production', () => {
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', PLATFORM_DEV_AUTH: 'true' })).toThrow(/PLATFORM_DEV_AUTH/);
    expect(() => loadConfig({ ...env, NODE_ENV: 'production', IAP_AUDIENCE: 'a', PLATFORM_FAKE_INTEGRATIONS: 'true' })).toThrow(/PLATFORM_FAKE_INTEGRATIONS/);
  });
});
