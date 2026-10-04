/*
 * The few Google Cloud REST calls the tenant API needs, authenticated as the Cloud Run service account through the
 * metadata server, or with a service account key outside Google Cloud. No client library: Cloud KMS encrypt and decrypt
 * are two small JSON calls.
 */
import { importPKCS8, SignJWT } from 'jose';

const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export type Fetch = typeof fetch;

/** Access tokens for the instance's service account, cached until a minute before they expire. */
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

/** Cloud KMS symmetric encrypt and decrypt with additional authenticated data. */
export class KmsClient {
  constructor(private readonly tokens: { get(): Promise<string> }, private readonly fetchFn: Fetch = fetch) {}

  private async call<T>(url: string, body: Record<string, string>): Promise<T> {
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.tokens.get()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Cloud KMS ${url.slice(url.lastIndexOf(':') + 1)} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  /** Returns the ciphertext and the key version that produced it. */
  async encrypt(keyName: string, plaintext: Buffer, aad: Buffer): Promise<{ ciphertext: Buffer; keyVersion: string }> {
    const r = await this.call<{ ciphertext: string; name: string }>(`https://cloudkms.googleapis.com/v1/${keyName}:encrypt`, {
      plaintext: plaintext.toString('base64'), additionalAuthenticatedData: aad.toString('base64'),
    });
    return { ciphertext: Buffer.from(r.ciphertext, 'base64'), keyVersion: r.name };
  }

  async decrypt(keyName: string, ciphertext: Buffer, aad: Buffer): Promise<Buffer> {
    const r = await this.call<{ plaintext: string }>(`https://cloudkms.googleapis.com/v1/${keyName}:decrypt`, {
      ciphertext: ciphertext.toString('base64'), additionalAuthenticatedData: aad.toString('base64'),
    });
    return Buffer.from(r.plaintext, 'base64');
  }
}
