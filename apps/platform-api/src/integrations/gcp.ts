/*
 * Production implementations of the onboarding integrations on Google Cloud, through the REST APIs and the Cloud Run
 * service account's token from the metadata server, or a service account key outside Google Cloud (no client libraries):
 *   - Cloud KMS: one key per tenant in the `tenants` key ring, rotated every 90 days;
 *   - Identity Platform: one tenant per Yutis tenant (email-link sign-in for the first admin; SSO is added later);
 *   - the first tenant admin's invitation: an Identity Platform email sign-in link to {tenant}/login.
 */
import { randomBytes } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import type { IdentityTenantService, Invitation, InvitationMailer, TenantKeyService } from './integrations.js';

const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const ROTATION_SECONDS = 90 * 24 * 3600;

export type Fetch = typeof fetch;

export class MetadataTokenSource {
  private token?: { value: string; expiresAt: number };

  constructor(private readonly fetchFn: Fetch = fetch) {}

  async get(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const res = await this.fetchFn(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!res.ok) throw new Error(`Metadata server token request failed: ${res.status}`);
    const body = await res.json() as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return body.access_token;
  }
}

/**
 * Access tokens for a service account from its JSON key (GOOGLE_SERVICE_ACCOUNT_KEY), for running outside Google Cloud
 * (Railway): a self-signed JWT exchanged at Google's token endpoint, cached until a minute before it expires.
 */
export class ServiceAccountTokenSource {
  private token?: { value: string; expiresAt: number };
  private readonly key: { client_email: string; private_key: string; token_uri?: string };

  constructor(keyJson: string, private readonly fetchFn: Fetch = fetch) {
    const key = JSON.parse(keyJson) as Partial<ServiceAccountTokenSource['key']>;
    if (!key.client_email || !key.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not a service account JSON key');
    this.key = { client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri };
  }

  async get(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const tokenUri = this.key.token_uri ?? 'https://oauth2.googleapis.com/token';
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.key.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(this.key.private_key, 'RS256'));
    const res = await this.fetchFn(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`Service account token request failed: ${res.status} ${await res.text()}`);
    const body = await res.json() as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return body.access_token;
  }
}

/** The service account key when one is configured (outside Google Cloud), otherwise the metadata server. */
export function googleTokenSource(env: Record<string, string | undefined> = process.env): { get(): Promise<string> } {
  return env.GOOGLE_SERVICE_ACCOUNT_KEY ? new ServiceAccountTokenSource(env.GOOGLE_SERVICE_ACCOUNT_KEY) : new MetadataTokenSource();
}

/** Authenticated JSON calls to Google APIs. */
export class GoogleApi {
  constructor(private readonly tokens: { get(): Promise<string> }, private readonly fetchFn: Fetch = fetch) {}

  async call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(url, {
      method,
      headers: { authorization: `Bearer ${await this.tokens.get()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${new URL(url).pathname} failed: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }
}

export class CloudKmsTenantKeys implements TenantKeyService {
  /** keyRing: projects/{project}/locations/asia-east1/keyRings/tenants */
  constructor(private readonly api: GoogleApi, private readonly keyRing: string) {}

  async createKey(tenantSlug: string): Promise<string> {
    // KMS key names can never be reused, so add a random suffix (a tenant may be onboarded again after a failure).
    const id = `${tenantSlug}-${randomBytes(4).toString('hex')}`;
    const key = await this.api.call<{ name: string }>('POST', `https://cloudkms.googleapis.com/v1/${this.keyRing}/cryptoKeys?cryptoKeyId=${id}`, {
      purpose: 'ENCRYPT_DECRYPT',
      versionTemplate: { algorithm: 'GOOGLE_SYMMETRIC_ENCRYPTION', protectionLevel: 'SOFTWARE' },
      rotationPeriod: `${ROTATION_SECONDS}s`,
      nextRotationTime: new Date(Date.now() + ROTATION_SECONDS * 1000).toISOString(),
      labels: { tenant: tenantSlug },
    });
    return key.name;
  }

  /** Schedules every version for destruction (Cloud KMS keeps them recoverable for its scheduled-destruction period). */
  async destroyKey(keyName: string): Promise<void> {
    await this.api.call('PATCH', `https://cloudkms.googleapis.com/v1/${keyName}?updateMask=rotationPeriod,nextRotationTime`, {});
    const { cryptoKeyVersions = [] } = await this.api.call<{ cryptoKeyVersions?: { name: string; state: string }[] }>(
      'GET', `https://cloudkms.googleapis.com/v1/${keyName}/cryptoKeyVersions?pageSize=1000`);
    for (const v of cryptoKeyVersions) {
      if (v.state === 'ENABLED' || v.state === 'DISABLED') await this.api.call('POST', `https://cloudkms.googleapis.com/v1/${v.name}:destroy`, {});
    }
  }
}

/** Identity Platform tenant display names: 4–20 characters, a letter first, then letters, digits or hyphens. */
export function idpDisplayName(slug: string): string {
  return `y-${slug}`.slice(0, 20).replace(/-+$/, '').padEnd(4, '0');
}

export class IdentityPlatformTenants implements IdentityTenantService {
  constructor(private readonly api: GoogleApi, private readonly projectId: string, private readonly tenantBaseDomain: string) {}

  private get base() {
    return `https://identitytoolkit.googleapis.com/v2/projects/${this.projectId}`;
  }

  async createTenant(tenantSlug: string): Promise<string> {
    await this.authorizeDomain(`${tenantSlug}.${this.tenantBaseDomain}`);
    const t = await this.api.call<{ name: string }>('POST', `${this.base}/tenants`, {
      displayName: idpDisplayName(tenantSlug),
      allowPasswordSignup: false,
      enableEmailLinkSignin: true,
    });
    return t.name.slice(t.name.lastIndexOf('/') + 1);
  }

  async deleteTenant(idpTenantId: string): Promise<void> {
    await this.api.call('DELETE', `${this.base}/tenants/${idpTenantId}`);
  }

  /** The tenant's sign-in page must be an authorized domain of the project for SSO redirects and email links. */
  private async authorizeDomain(domain: string): Promise<void> {
    const config = await this.api.call<{ authorizedDomains?: string[] }>('GET', `${this.base}/config`);
    const domains = config.authorizedDomains ?? [];
    if (domains.includes(domain)) return;
    await this.api.call('PATCH', `${this.base}/config?updateMask=authorizedDomains`, { authorizedDomains: [...domains, domain] });
  }
}

/** The invitation is Identity Platform's own sign-in email: no separate email provider is needed. */
export class IdentityPlatformInvitations implements InvitationMailer {
  constructor(private readonly api: GoogleApi, private readonly projectId: string) {}

  async sendTenantAdminInvitation(i: Invitation): Promise<void> {
    await this.api.call('POST', 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', {
      requestType: 'EMAIL_SIGNIN',
      email: i.email,
      targetProjectId: this.projectId,
      tenantId: i.idpTenantId,
      continueUrl: `${i.tenantUrl}/login`,
      canHandleCodeInApp: true,
    });
  }
}
