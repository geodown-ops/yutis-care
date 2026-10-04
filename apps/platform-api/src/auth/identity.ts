import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { FastifyRequest } from 'fastify';

/**
 * Who is calling. On Google Cloud the platform admin sits behind Identity-Aware Proxy, which lets only allow-listed
 * Workspace accounts through and signs each request; the API verifies that signature rather than trusting any header.
 * Elsewhere (Railway) platform staff sign in with Google through Identity Platform and send the ID token as a bearer
 * token. Either way the guard then requires an active platform account for that email.
 */
export interface PlatformIdentityVerifier {
  /** The verified email of the caller, or undefined if the request carries no valid identity. */
  identify(request: FastifyRequest): Promise<string | undefined>;
}

export const PLATFORM_IDENTITY = Symbol('PLATFORM_IDENTITY');

export const IAP_HEADER = 'x-goog-iap-jwt-assertion';
const IAP_ISSUER = 'https://cloud.google.com/iap';
const IAP_KEYS_URL = 'https://www.gstatic.com/iap/verify/public_key-jwk';

/** Verifies the IAP-signed JWT (ES256, Google's published keys, this backend service's audience). */
export class IapIdentityVerifier implements PlatformIdentityVerifier {
  constructor(
    private readonly audience: string,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(IAP_KEYS_URL)),
  ) {}

  async identify(request: FastifyRequest): Promise<string | undefined> {
    const token = request.headers[IAP_HEADER];
    if (typeof token !== 'string' || !token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.keys, { issuer: IAP_ISSUER, audience: this.audience, algorithms: ['ES256'] });
      return typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
    } catch {
      return undefined;
    }
  }
}

export const DEV_USER_HEADER = 'x-dev-platform-user';

/** Local development only (PLATFORM_DEV_AUTH=true, refused in production): trusts `X-Dev-Platform-User: <email>`. */
export class DevIdentityVerifier implements PlatformIdentityVerifier {
  async identify(request: FastifyRequest): Promise<string | undefined> {
    const email = request.headers[DEV_USER_HEADER];
    return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : undefined;
  }
}

const SECURETOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Platform staff signed in with Google through the project's Identity Platform (project level, never a customer's
 * tenant): `Authorization: Bearer <ID token>`. Accepts only Google sign-ins with a verified email, so a customer's SSO
 * or email-link account can never pass, even with a matching address.
 */
export class GoogleSignInIdentityVerifier implements PlatformIdentityVerifier {
  constructor(
    private readonly projectId: string,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(SECURETOKEN_JWKS)),
  ) {}

  async identify(request: FastifyRequest): Promise<string | undefined> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: `https://securetoken.google.com/${this.projectId}`, audience: this.projectId, algorithms: ['RS256'],
      });
      const firebase = payload.firebase as { tenant?: string; sign_in_provider?: string } | undefined;
      if (firebase?.tenant || firebase?.sign_in_provider !== 'google.com') return undefined;
      if (payload.email_verified !== true || typeof payload.email !== 'string') return undefined;
      return payload.email.toLowerCase();
    } catch {
      return undefined;
    }
  }
}
