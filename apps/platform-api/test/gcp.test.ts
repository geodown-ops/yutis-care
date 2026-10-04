import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { CloudKmsTenantKeys, GoogleApi, IdentityPlatformInvitations, IdentityPlatformTenants, idpDisplayName, type Fetch } from '../src/integrations/gcp.js';

/** Records requests and answers from a table of `METHOD path` → JSON. */
function fakeGoogle(answers: Record<string, unknown>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchFn: Fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer t0ken');
    const key = `${method} ${new URL(url).pathname}`;
    return key in answers ? Response.json(answers[key]) : new Response(`no fake for ${key}`, { status: 404 });
  };
  return { api: new GoogleApi({ get: async () => 't0ken' }, fetchFn), calls };
}

const RING = 'projects/yutis-care-prod/locations/asia-east1/keyRings/tenants';

describe('Cloud KMS tenant keys', () => {
  it('creates a rotating software key per tenant, named after it', async () => {
    const { api, calls } = fakeGoogle({ [`POST /v1/${RING}/cryptoKeys`]: { name: `${RING}/cryptoKeys/acme-1a2b3c4d` } });
    expect(await new CloudKmsTenantKeys(api, RING).createKey('acme')).toBe(`${RING}/cryptoKeys/acme-1a2b3c4d`);
    expect(calls[0]!.url).toMatch(/cryptoKeyId=acme-[0-9a-f]{8}$/);
    expect(calls[0]!.body).toMatchObject({ purpose: 'ENCRYPT_DECRYPT', rotationPeriod: '7776000s', versionTemplate: { protectionLevel: 'SOFTWARE' } });
  });

  it('destroys every live version of the key', async () => {
    const key = `${RING}/cryptoKeys/acme-1`;
    const { api, calls } = fakeGoogle({
      [`PATCH /v1/${key}`]: {},
      [`GET /v1/${key}/cryptoKeyVersions`]: { cryptoKeyVersions: [{ name: `${key}/cryptoKeyVersions/1`, state: 'ENABLED' }, { name: `${key}/cryptoKeyVersions/2`, state: 'DESTROYED' }] },
      [`POST /v1/${key}/cryptoKeyVersions/1:destroy`]: {},
    });
    await new CloudKmsTenantKeys(api, RING).destroyKey(key);
    expect(calls.filter(c => c.url.endsWith(':destroy')).map(c => c.url)).toEqual([`https://cloudkms.googleapis.com/v1/${key}/cryptoKeyVersions/1:destroy`]);
  });
});

describe('Identity Platform', () => {
  const v2 = '/v2/projects/yutis-care-prod';

  it('authorizes the tenant domain and creates an email-link tenant', async () => {
    const { api, calls } = fakeGoogle({
      [`GET ${v2}/config`]: { authorizedDomains: ['care.yutis.com.tw'] },
      [`PATCH ${v2}/config`]: {},
      [`POST ${v2}/tenants`]: { name: 'projects/yutis-care-prod/tenants/y-acme-x7k2p' },
    });
    expect(await new IdentityPlatformTenants(api, 'yutis-care-prod', 'care.yutis.com.tw').createTenant('acme')).toBe('y-acme-x7k2p');
    expect(calls[1]!.body).toEqual({ authorizedDomains: ['care.yutis.com.tw', 'acme.care.yutis.com.tw'] });
    expect(calls[2]!.body).toEqual({ displayName: 'y-acme', allowPasswordSignup: false, enableEmailLinkSignin: true });
  });

  it('makes valid display names', () => {
    expect(idpDisplayName('a')).toBe('y-a0');
    expect(idpDisplayName('a-very-long-company-name')).toBe('y-a-very-long-compan');
    expect(idpDisplayName('abcdefghijklmnopq-x')).toBe('y-abcdefghijklmnopq');
    for (const slug of ['a', '9lives', 'x-'.repeat(20) + 'y']) expect(idpDisplayName(slug)).toMatch(/^[a-zA-Z][a-zA-Z0-9-]{3,19}$/);
  });

  it("invites the first admin with the tenant's sign-in link", async () => {
    const { api, calls } = fakeGoogle({ 'POST /v1/accounts:sendOobCode': { email: 'boss@acme.test' } });
    await new IdentityPlatformInvitations(api, 'yutis-care-prod').sendTenantAdminInvitation({
      email: 'boss@acme.test', name: '王大明', tenantName: 'Acme', tenantUrl: 'https://acme.care.yutis.com.tw', idpTenantId: 'y-acme-x7k2p',
    });
    expect(calls[0]!.body).toEqual({
      requestType: 'EMAIL_SIGNIN', email: 'boss@acme.test', targetProjectId: 'yutis-care-prod', tenantId: 'y-acme-x7k2p',
      continueUrl: 'https://acme.care.yutis.com.tw/login', canHandleCodeInApp: true,
    });
  });
});

describe('loadConfig (Google Cloud integrations)', () => {
  const env = { PLATFORM_DATABASE_URL: 'postgres://x/y', IAP_AUDIENCE: '/projects/1/global/backendServices/2' };

  it('needs both the project and the key ring, and never with the fakes', () => {
    expect(loadConfig({ ...env, GCP_PROJECT_ID: 'p', KMS_KEY_RING: RING }).gcp).toEqual({ projectId: 'p', kmsKeyRing: RING });
    expect(() => loadConfig({ ...env, GCP_PROJECT_ID: 'p' })).toThrow(/go together/);
    expect(() => loadConfig({ ...env, GCP_PROJECT_ID: 'p', KMS_KEY_RING: 'tenants' })).toThrow(/KMS_KEY_RING/);
    expect(() => loadConfig({ ...env, GCP_PROJECT_ID: 'p', KMS_KEY_RING: RING, PLATFORM_FAKE_INTEGRATIONS: 'true' })).toThrow(/either/);
  });
});
