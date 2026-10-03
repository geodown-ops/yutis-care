import { ServiceUnavailableException } from '@nestjs/common';
import type { TenantSummary } from '@yutis/db';

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
  verify(token: string, tenant: TenantSummary): Promise<VerifiedIdentity | undefined>;
}

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

/** Until Identity Platform is connected, sign-in is unavailable (except AUTH_DEV_SIGN_IN locally). */
export class UnconfiguredIdentityVerifier implements IdentityVerifier {
  async loginMethods(): Promise<LoginMethod[]> {
    return [];
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

  async verify(token: string): Promise<VerifiedIdentity | undefined> {
    const value = token.trim().toLowerCase();
    if (!value) return undefined;
    return value.includes('@') ? { issuer: 'dev', subject: value, email: value } : { issuer: 'dev', subject: value, phone: value };
  }
}
