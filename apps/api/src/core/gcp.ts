/*
 * The few Google Cloud REST calls the tenant API needs, authenticated as the Cloud Run service account through the
 * metadata server. No client library: Cloud KMS encrypt and decrypt are two small JSON calls.
 */

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
