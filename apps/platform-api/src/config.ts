import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform(v => v === 'true');

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Login role that is a member of `yutis_platform` (never yutis_app, never the table owner). */
  PLATFORM_DATABASE_URL: z.string().min(1),
  /** Tenants are served at {slug}.{TENANT_BASE_DOMAIN}; used for links in invitations. */
  TENANT_BASE_DOMAIN: z.string().min(1).default('care.yutis.net'),
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
  /**
   * How the platform's own email goes out (trial application notices): `log` only logs that a message would have been
   * sent; `resend` sends through Resend's HTTPS API, like the tenant API.
   */
  EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** e.g. "Yutis Care <noreply@care.yutis.net>" */
  EMAIL_FROM: z.string().min(1).optional(),
  /** Comma-separated addresses told about each new trial application (營運). None = only the platform admin shows them. */
  TRIAL_NOTIFY_EMAILS: z.string().default(''),
  /**
   * The marketing site's address, where the payment page lives (/pay/?t=…) and TapPay sends the payer back after 3D
   * Secure. Default https://{TENANT_BASE_DOMAIN}. TapPay refuses localhost: test 3D Secure locally on
   * http://127.0.0.1.nip.io:5184.
   */
  PUBLIC_SITE_URL: z.url().optional(),
  /**
   * Card payments through TapPay Direct Pay (Pay by Prime), as in the Bazar site. All four together, or none (the payment
   * page then offers no card payment and orders can only be marked paid by hand). The app id and app key are public
   * (the payment page's SDK uses them); the partner key is secret (Secret Manager in production).
   */
  TAPPAY_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  TAPPAY_APP_ID: z.coerce.number().int().positive().optional(),
  TAPPAY_APP_KEY: z.string().min(1).optional(),
  TAPPAY_PARTNER_KEY: z.string().min(1).optional(),
  TAPPAY_MERCHANT_ID: z.string().min(1).optional(),
  /** 3D Secure. Default on in production (the account's production merchants all require it), off in the sandbox. */
  TAPPAY_USE_3DS: flag.optional(),
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
  email: EmailConfig;
  trialNotifyEmails: string[];
  /** e.g. https://care.yutis.net, without a trailing slash. */
  siteUrl: string;
  /** Card payments; undefined = not configured. */
  tappay?: TapPayConfig;
}

export interface TapPayConfig {
  env: 'sandbox' | 'production';
  appId: number;
  appKey: string;
  partnerKey: string;
  merchantId: string;
  use3DS: boolean;
}

export type EmailConfig = { provider: 'log' } | { provider: 'resend'; apiKey: string; from: string };

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
  if (e.EMAIL_PROVIDER === 'resend' && (!e.RESEND_API_KEY || !e.EMAIL_FROM)) throw new Error('EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM');
  const trialNotifyEmails = e.TRIAL_NOTIFY_EMAILS.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
  if (!trialNotifyEmails.every(a => z.email().safeParse(a).success)) throw new Error('TRIAL_NOTIFY_EMAILS must be comma-separated email addresses');
  const tappay = [e.TAPPAY_APP_ID, e.TAPPAY_APP_KEY, e.TAPPAY_PARTNER_KEY, e.TAPPAY_MERCHANT_ID];
  if (tappay.some(v => v !== undefined) && !tappay.every(v => v !== undefined)) {
    throw new Error('TAPPAY_APP_ID, TAPPAY_APP_KEY, TAPPAY_PARTNER_KEY and TAPPAY_MERCHANT_ID go together');
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
    email: e.EMAIL_PROVIDER === 'resend' ? { provider: 'resend', apiKey: e.RESEND_API_KEY!, from: e.EMAIL_FROM! } : { provider: 'log' },
    trialNotifyEmails,
    siteUrl: (e.PUBLIC_SITE_URL ?? `https://${e.TENANT_BASE_DOMAIN.toLowerCase()}`).replace(/\/+$/, ''),
    tappay: e.TAPPAY_APP_ID && e.TAPPAY_APP_KEY && e.TAPPAY_PARTNER_KEY && e.TAPPAY_MERCHANT_ID
      ? {
        env: e.TAPPAY_ENV, appId: e.TAPPAY_APP_ID, appKey: e.TAPPAY_APP_KEY, partnerKey: e.TAPPAY_PARTNER_KEY, merchantId: e.TAPPAY_MERCHANT_ID,
        use3DS: e.TAPPAY_USE_3DS ?? e.TAPPAY_ENV === 'production',
      }
      : undefined,
  };
}
