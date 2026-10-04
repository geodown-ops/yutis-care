import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform(v => v === 'true');

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Login role that is a member of `yutis_platform` (never yutis_app, never the table owner). */
  PLATFORM_DATABASE_URL: z.string().min(1),
  /** Tenants are served at {slug}.{TENANT_BASE_DOMAIN}; used for links in invitations. */
  TENANT_BASE_DOMAIN: z.string().min(1).default('care.yutis.com.tw'),
  /** Identity-Aware Proxy audience: /projects/{number}/global/backendServices/{id} (on Google Cloud). */
  IAP_AUDIENCE: z.string().min(1).optional(),
  /**
   * Outside Google Cloud (Railway), instead of IAP: platform staff sign in with Google through this project's Identity
   * Platform. The browser API key and auth domain are handed to the sign-in page (not secret).
   */
  PLATFORM_SIGN_IN_PROJECT_ID: z.string().min(1).optional(),
  PLATFORM_SIGN_IN_API_KEY: z.string().min(1).optional(),
  PLATFORM_SIGN_IN_AUTH_DOMAIN: z.string().min(1).optional(),
  /** Behind the Google Cloud load balancer: take the client IP from X-Forwarded-For. */
  TRUST_PROXY: flag.default(false),
  /** Accept `X-Dev-Platform-User: <email>` instead of the IAP header. Local development only. */
  PLATFORM_DEV_AUTH: flag.default(false),
  /** Fake Cloud KMS, Identity Platform and email that only log. Local development and tests only. */
  PLATFORM_FAKE_INTEGRATIONS: flag.default(false),
  /** Production: this project's Identity Platform, and the KMS key ring for tenant keys (projects/…/keyRings/tenants). */
  GCP_PROJECT_ID: z.string().min(1).optional(),
  KMS_KEY_RING: z.string().regex(/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+$/).optional(),
});

export interface PlatformConfig {
  production: boolean;
  port: number;
  databaseUrl: string;
  tenantBaseDomain: string;
  iapAudience?: string;
  /** Google sign-in through Identity Platform (instead of IAP). */
  signIn?: { projectId: string; apiKey: string; authDomain: string };
  trustProxy: boolean;
  devAuth: boolean;
  fakeIntegrations: boolean;
  /** Cloud KMS and Identity Platform for onboarding; undefined = those steps answer 503 (unless faked). */
  gcp?: { projectId: string; kmsKeyRing: string };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): PlatformConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid platform API configuration:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && e.PLATFORM_DEV_AUTH) throw new Error('PLATFORM_DEV_AUTH must not be enabled in production');
  if (production && e.PLATFORM_FAKE_INTEGRATIONS) throw new Error('PLATFORM_FAKE_INTEGRATIONS must not be enabled in production');
  if (!!e.GCP_PROJECT_ID !== !!e.KMS_KEY_RING) throw new Error('GCP_PROJECT_ID and KMS_KEY_RING go together');
  if (e.GCP_PROJECT_ID && e.PLATFORM_FAKE_INTEGRATIONS) throw new Error('Use either PLATFORM_FAKE_INTEGRATIONS or GCP_PROJECT_ID, not both');
  const signIn = [e.PLATFORM_SIGN_IN_PROJECT_ID, e.PLATFORM_SIGN_IN_API_KEY, e.PLATFORM_SIGN_IN_AUTH_DOMAIN];
  if (signIn.some(Boolean) && !signIn.every(Boolean)) {
    throw new Error('PLATFORM_SIGN_IN_PROJECT_ID, PLATFORM_SIGN_IN_API_KEY and PLATFORM_SIGN_IN_AUTH_DOMAIN go together');
  }
  const ways = [e.PLATFORM_DEV_AUTH, !!e.IAP_AUDIENCE, !!e.PLATFORM_SIGN_IN_PROJECT_ID].filter(Boolean).length;
  if (ways !== 1) throw new Error('Configure exactly one of IAP_AUDIENCE, PLATFORM_SIGN_IN_PROJECT_ID or PLATFORM_DEV_AUTH');
  return {
    production,
    port: e.PORT,
    databaseUrl: e.PLATFORM_DATABASE_URL,
    tenantBaseDomain: e.TENANT_BASE_DOMAIN.toLowerCase(),
    iapAudience: e.IAP_AUDIENCE,
    signIn: e.PLATFORM_SIGN_IN_PROJECT_ID && e.PLATFORM_SIGN_IN_API_KEY && e.PLATFORM_SIGN_IN_AUTH_DOMAIN
      ? { projectId: e.PLATFORM_SIGN_IN_PROJECT_ID, apiKey: e.PLATFORM_SIGN_IN_API_KEY, authDomain: e.PLATFORM_SIGN_IN_AUTH_DOMAIN }
      : undefined,
    trustProxy: e.TRUST_PROXY,
    devAuth: e.PLATFORM_DEV_AUTH,
    fakeIntegrations: e.PLATFORM_FAKE_INTEGRATIONS,
    gcp: e.GCP_PROJECT_ID && e.KMS_KEY_RING ? { projectId: e.GCP_PROJECT_ID, kmsKeyRing: e.KMS_KEY_RING } : undefined,
  };
}
