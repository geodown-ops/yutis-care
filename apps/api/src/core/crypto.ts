/*
 * Application-side encryption of `_enc` columns (病史、症狀、協助紀錄內容…) and keyed fingerprints of values that must
 * never be stored, such as national ID numbers. Every tenant has its own keys, so one tenant's ciphertext cannot be
 * read with another's, and destroying a tenant's key makes its data unreadable.
 *
 * Production keeps one random data key per tenant and purpose in `tenant_keys`, wrapped by the tenant's Cloud KMS key
 * (tenants.kms_key_name), and unwraps it through Cloud KMS once per process (KmsTenantCrypto). Local development, tests
 * and the demo site derive the keys from one local master key instead (TENANT_CRYPTO_LOCAL_KEY). Both produce the same
 * ciphertext format; only where the key comes from differs.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { tenantKeys, tenants, withTenant, type Db } from '@yutis/db';
import { and, eq } from 'drizzle-orm';
import type { KmsClient } from './gcp.js';

export interface TenantCrypto {
  encrypt(tenantId: string, plaintext: string): Promise<Buffer>;
  decrypt(tenantId: string, ciphertext: Buffer): Promise<string>;
  /** Keyed hash for matching a value without storing it (national ID numbers). Stable per tenant. */
  fingerprint(tenantId: string, value: string): Promise<string>;
}

export const TENANT_CRYPTO = Symbol('TENANT_CRYPTO');

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

type KeyPurpose = 'data' | 'fingerprint';

/** AES-256-GCM (tenant id as additional data) and HMAC-SHA256 with per-tenant keys; subclasses supply the keys. */
abstract class KeyedTenantCrypto implements TenantCrypto {
  protected abstract key(tenantId: string, purpose: KeyPurpose): Promise<Buffer>;

  async encrypt(tenantId: string, plaintext: string): Promise<Buffer> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', await this.key(tenantId, 'data'), iv);
    cipher.setAAD(Buffer.from(tenantId));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
  }

  async decrypt(tenantId: string, ciphertext: Buffer): Promise<string> {
    if (ciphertext[0] !== VERSION) throw new Error('Unknown ciphertext version');
    const iv = ciphertext.subarray(1, 1 + IV_BYTES);
    const tag = ciphertext.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', await this.key(tenantId, 'data'), iv);
    decipher.setAAD(Buffer.from(tenantId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
  }

  async fingerprint(tenantId: string, value: string): Promise<string> {
    return createHmac('sha256', await this.key(tenantId, 'fingerprint')).update(value).digest('hex');
  }
}

/** Per-tenant keys derived (HKDF-SHA256) from one local master key. Local development, tests and the demo site only. */
export class LocalTenantCrypto extends KeyedTenantCrypto {
  private readonly keys = new Map<string, Buffer>();

  constructor(private readonly masterKey: Buffer) {
    super();
    if (masterKey.length !== 32) throw new Error('TENANT_CRYPTO_LOCAL_KEY must be 32 bytes (base64)');
  }

  protected async key(tenantId: string, purpose: KeyPurpose): Promise<Buffer> {
    const id = `${purpose}:${tenantId}`;
    let key = this.keys.get(id);
    if (!key) {
      key = Buffer.from(hkdfSync('sha256', this.masterKey, Buffer.from(tenantId), `yutis-${purpose}-key`, 32));
      this.keys.set(id, key);
    }
    return key;
  }
}

/**
 * Envelope encryption with Cloud KMS. A tenant's data keys are created on first use (random, wrapped by the tenant's
 * KMS key, stored in `tenant_keys`), then unwrapped once per process and kept in memory. The pool passed in must be
 * its own small pool: a request already holds a connection from the main pool while it encrypts.
 */
export class KmsTenantCrypto extends KeyedTenantCrypto {
  private readonly keys = new Map<string, Promise<Buffer>>();

  constructor(private readonly db: Db, private readonly kms: Pick<KmsClient, 'encrypt' | 'decrypt'>) {
    super();
  }

  protected key(tenantId: string, purpose: KeyPurpose): Promise<Buffer> {
    const id = `${purpose}:${tenantId}`;
    let key = this.keys.get(id);
    if (!key) {
      key = this.load(tenantId, purpose);
      this.keys.set(id, key);
      key.catch(() => this.keys.delete(id));
    }
    return key;
  }

  private async load(tenantId: string, purpose: KeyPurpose): Promise<Buffer> {
    const aad = Buffer.from(`${tenantId}:${purpose}`);
    const { keyName, wrapped } = await withTenant(this.db, tenantId, async tx => {
      const [tenant] = await tx.select({ keyName: tenants.kmsKeyName }).from(tenants).where(eq(tenants.id, tenantId));
      const [row] = await tx.select().from(tenantKeys).where(and(eq(tenantKeys.tenantId, tenantId), eq(tenantKeys.purpose, purpose)));
      return { keyName: tenant?.keyName ?? null, wrapped: row?.wrappedKey };
    });
    if (!keyName) {
      throw new ServiceUnavailableException({ code: 'encryption_unavailable', message: 'This tenant has no encryption key yet' });
    }
    if (wrapped) return this.kms.decrypt(keyName, wrapped, aad);

    const key = randomBytes(32);
    const { ciphertext, keyVersion } = await this.kms.encrypt(keyName, key, aad);
    const [inserted] = await withTenant(this.db, tenantId, tx => tx.insert(tenantKeys)
      .values({ tenantId, purpose, wrappedKey: ciphertext, kmsKeyVersion: keyVersion })
      .onConflictDoNothing().returning({ tenantId: tenantKeys.tenantId }));
    if (inserted) return key;
    // Another instance created it at the same moment: use theirs.
    return this.load(tenantId, purpose);
  }
}

/** Until Cloud KMS is connected, production has no keys: anything needing encryption answers 503. */
export class UnconfiguredTenantCrypto implements TenantCrypto {
  private unavailable(): never {
    throw new ServiceUnavailableException({ code: 'encryption_unavailable', message: 'Tenant encryption is not configured' });
  }
  async encrypt(): Promise<Buffer> { this.unavailable(); }
  async decrypt(): Promise<string> { this.unavailable(); }
  async fingerprint(): Promise<string> { this.unavailable(); }
}

export async function encryptOptional(crypto: TenantCrypto, tenantId: string, text: string | null | undefined): Promise<Buffer | null> {
  return text ? crypto.encrypt(tenantId, text) : null;
}

export async function decryptOptional(crypto: TenantCrypto, tenantId: string, data: Buffer | null | undefined): Promise<string | null> {
  return data ? crypto.decrypt(tenantId, data) : null;
}
