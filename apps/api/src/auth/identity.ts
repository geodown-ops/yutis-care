import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { TenantSummary } from '@yutis/db';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Fetch } from '../core/gcp.js';

/** How people can sign in to a tenant; the sign-in page shows these. `dev` only exists with AUTH_DEV_SIGN_IN locally. */
export const LOGIN_METHODS = ['sso', 'password', 'sms', 'email_otp', 'dev'] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

/** A person as asserted by the sign-in provider. */
export interface VerifiedIdentity {
  /** The provider and the person's stable id there; stored on `users` at first sign-in. */
  issuer: string;
  subject: string;
  /** Only if the provider verified it. */
  email?: string;
  phone?: string;
}

/**
 * Turns the token the browser obtained from the sign-in provider into a verified identity. The production
 * implementation verifies a Google Cloud Identity Platform ID token and must reject one issued for another tenant's
 * provider tenant. Returns undefined for an invalid or expired token.
 */
export interface IdentityVerifier {
  /** The sign-in methods this tenant offers (from its provider configuration). */
  loginMethods(tenant: TenantSummary): Promise<LoginMethod[]>;
  /** What the browser's sign-in SDK needs for this tenant; null when it does not use Identity Platform. */
  signInConfig(tenant: TenantSummary): Promise<IdentityPlatformSignIn | null>;
  verify(token: string, tenant: TenantSummary): Promise<VerifiedIdentity | undefined>;
}

/** An identity provider configured on the tenant's Identity Platform tenant (a SAML or OIDC SSO, Google, Microsoft). */
export interface SignInProvider {
  /** Provider id for the sign-in SDK: `saml.…`, `oidc.…`, `google.com`, `microsoft.com`. */
  id: string;
  label: string;
}

/** Firebase Auth web configuration for one tenant's sign-in page. None of it is secret. */
export interface IdentityPlatformSignIn {
  apiKey: string;
  authDomain: string;
  tenantId: string;
  providers: SignInProvider[];
}

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

/** Until Identity Platform is connected, sign-in is unavailable (except AUTH_DEV_SIGN_IN locally). */
export class UnconfiguredIdentityVerifier implements IdentityVerifier {
  async loginMethods(): Promise<LoginMethod[]> {
    return [];
  }

  async signInConfig(): Promise<null> {
    return null;
  }

  async verify(): Promise<VerifiedIdentity | undefined> {
    throw new ServiceUnavailableException({ code: 'sign_in_unavailable', message: 'Sign-in is not configured' });
  }
}

/** Local development only (AUTH_DEV_SIGN_IN=true): the "token" is the email address or phone number itself. */
export class DevIdentityVerifier implements IdentityVerifier {
  async loginMethods(): Promise<LoginMethod[]> {
    return ['dev'];
  }

  async signInConfig(): Promise<null> {
    return null;
  }

  async verify(token: string): Promise<VerifiedIdentity | undefined> {
    const value = token.trim().toLowerCase();
    if (!value) return undefined;
    return value.includes('@') ? { issuer: 'dev', subject: value, email: value } : { issuer: 'dev', subject: value, phone: value };
  }
}

const SECURETOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_IDP_LABELS: Record<string, string> = { 'google.com': 'Google', 'microsoft.com': 'Microsoft', 'apple.com': 'Apple' };
const TENANT_CONFIG_TTL_MS = 5 * 60_000;

export interface IdentityPlatformOptions {
  projectId: string;
  /** Browser API key and auth domain of the project (Identity Platform → Application setup details). */
  apiKey: string;
  authDomain: string;
  /** Access tokens for the Identity Toolkit admin API (reading each tenant's providers). */
  tokens: { get(): Promise<string> };
  fetchFn?: Fetch;
  /** Public keys of the token signer; tests pass a local key set. */
  keys?: JWTVerifyGetKey;
}

interface TenantSignInSettings { providers: SignInProvider[]; emailLink: boolean; password: boolean }

/**
 * Production sign-in: Google Cloud Identity Platform with one Identity Platform tenant per Yutis tenant. The browser
 * signs in with the Firebase Auth SDK (SSO, email link) and sends the ID token; this checks its signature, issuer,
 * audience and expiry, and that it was issued by the subdomain's own Identity Platform tenant, so a token from one
 * customer's sign-in can never open another customer's back office.
 */
export class IdentityPlatformVerifier implements IdentityVerifier {
  private readonly logger = new Logger(IdentityPlatformVerifier.name);
  private readonly keys: JWTVerifyGetKey;
  private readonly fetchFn: Fetch;
  private readonly settings = new Map<string, { at: number; value: Promise<TenantSignInSettings> }>();

  constructor(private readonly options: IdentityPlatformOptions) {
    this.keys = options.keys ?? createRemoteJWKSet(new URL(SECURETOKEN_JWKS));
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get issuer(): string {
    return `https://securetoken.google.com/${this.options.projectId}`;
  }

  async loginMethods(tenant: TenantSummary): Promise<LoginMethod[]> {
    if (!tenant.idpTenantId) return [];
    const s = await this.tenantSettings(tenant.idpTenantId);
    return [
      ...(s.providers.length ? ['sso' as const] : []),
      ...(s.emailLink ? ['email_otp' as const] : []),
      ...(s.password ? ['password' as const] : []),
    ];
  }

  async signInConfig(tenant: TenantSummary): Promise<IdentityPlatformSignIn | null> {
    if (!tenant.idpTenantId) return null;
    const { providers } = await this.tenantSettings(tenant.idpTenantId);
    return { apiKey: this.options.apiKey, authDomain: this.options.authDomain, tenantId: tenant.idpTenantId, providers };
  }

  async verify(token: string, tenant: TenantSummary): Promise<VerifiedIdentity | undefined> {
    if (!tenant.idpTenantId) return undefined;
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.keys, { issuer: this.issuer, audience: this.options.projectId, algorithms: ['RS256'] }));
    } catch {
      return undefined;
    }
    const firebase = payload.firebase as { tenant?: string } | undefined;
    if (!payload.sub || firebase?.tenant !== tenant.idpTenantId) return undefined;
    const email = payload.email_verified === true && typeof payload.email === 'string' ? payload.email : undefined;
    const phone = typeof payload.phone_number === 'string' ? payload.phone_number : undefined;
    return { issuer: `${this.issuer}/${tenant.idpTenantId}`, subject: payload.sub, email, phone };
  }

  /** The tenant's providers and switches, cached for a few minutes. On an admin API error: no providers, logged. */
  private tenantSettings(idpTenantId: string): Promise<TenantSignInSettings> {
    const cached = this.settings.get(idpTenantId);
    if (cached && Date.now() - cached.at < TENANT_CONFIG_TTL_MS) return cached.value;
    const value = this.loadSettings(idpTenantId).catch((error: unknown) => {
      this.logger.error(`Could not read Identity Platform tenant ${idpTenantId}: ${error instanceof Error ? error.message : String(error)}`);
      this.settings.delete(idpTenantId);
      return { providers: [], emailLink: false, password: false };
    });
    this.settings.set(idpTenantId, { at: Date.now(), value });
    return value;
  }

  private async loadSettings(idpTenantId: string): Promise<TenantSignInSettings> {
    const base = `https://identitytoolkit.googleapis.com/v2/projects/${this.options.projectId}/tenants/${idpTenantId}`;
    const get = async <T>(url: string): Promise<T> => {
      const res = await this.fetchFn(url, { headers: { authorization: `Bearer ${await this.options.tokens.get()}` } });
      if (!res.ok) throw new Error(`${res.status} ${url.slice(base.length) || '/'}`);
      return res.json() as Promise<T>;
    };
    type Idp = { name: string; displayName?: string; enabled?: boolean };
    const [tenant, oidc, saml, builtIn] = await Promise.all([
      get<{ enableEmailLinkSignin?: boolean; allowPasswordSignup?: boolean }>(base),
      get<{ oauthIdpConfigs?: Idp[] }>(`${base}/oauthIdpConfigs`),
      get<{ inboundSamlConfigs?: Idp[] }>(`${base}/inboundSamlConfigs`),
      get<{ defaultSupportedIdpConfigs?: Idp[] }>(`${base}/defaultSupportedIdpConfigs`),
    ]);
    const toProvider = (c: Idp): SignInProvider => {
      const id = c.name.slice(c.name.lastIndexOf('/') + 1);
      return { id, label: c.displayName || DEFAULT_IDP_LABELS[id] || id };
    };
    const providers = [...(saml.inboundSamlConfigs ?? []), ...(oidc.oauthIdpConfigs ?? []), ...(builtIn.defaultSupportedIdpConfigs ?? [])]
      .filter(c => c.enabled).map(toProvider);
    return { providers, emailLink: !!tenant.enableEmailLinkSignin, password: !!tenant.allowPasswordSignup };
  }
}
