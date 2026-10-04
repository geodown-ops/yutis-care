import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform(v => v === 'true');

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Login role that is a member of `yutis_app` (never the table owner, or RLS would not apply). */
  APP_DATABASE_URL: z.string().min(1),
  /** Tenants are served at {slug}.{TENANT_BASE_DOMAIN}; locally e.g. `localhost` → demo.localhost:3000. */
  TENANT_BASE_DOMAIN: z.string().min(1).default('care.yutis.com.tw'),
  /** Secure cookies (`__Host-` prefix). Only turn off for plain-http local development. */
  COOKIE_SECURE: flag.default(true),
  /** Behind the Google Cloud load balancer: take the client IP and host from X-Forwarded-* headers. */
  TRUST_PROXY: flag.default(false),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(15),
  SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),
  /** Sign in with an email address or phone number as the token, no password. Local development only. */
  AUTH_DEV_SIGN_IN: flag.default(false),
  /** Base64 32-byte master key for local per-tenant encryption keys. Local development and tests only; production uses Cloud KMS. */
  TENANT_CRYPTO_LOCAL_KEY: z.string().min(1).optional(),
  /** Encrypt with per-tenant data keys wrapped by Cloud KMS (production). */
  TENANT_CRYPTO_KMS: flag.default(false),
  /** Verify sign-in tokens issued by Google Cloud Identity Platform in this project (production). */
  IDENTITY_PLATFORM_PROJECT_ID: z.string().min(1).optional(),
  /** The project's browser API key and auth domain, handed to the sign-in page (not secret). */
  IDENTITY_PLATFORM_API_KEY: z.string().min(1).optional(),
  IDENTITY_PLATFORM_AUTH_DOMAIN: z.string().min(1).optional(),
  /**
   * The marketing demo site (demo.care.yutis.com.tw), a separate deployment whose database holds only fictional data.
   * There, dev sign-in and the local encryption key are allowed even with NODE_ENV=production. Never set on the
   * production deployment.
   */
  DEMO_SITE: flag.default(false),
  /**
   * How email goes out (staff invitations, 附表八 sign-off links, employee confirmation links): `log` only logs that a
   * message would have been sent (local development, the demo site); `resend` sends through Resend's HTTPS API.
   */
  EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Sender, e.g. `Yutis Care <noreply@care.yutis.com.tw>`; its domain must be verified with the provider. */
  EMAIL_FROM: z.string().min(1).optional(),
});

export interface ApiConfig {
  production: boolean;
  /** The marketing demo site (fictional data only). */
  demoSite: boolean;
  port: number;
  databaseUrl: string;
  tenantBaseDomain: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  sessionIdleSeconds: number;
  sessionMaxSeconds: number;
  devSignIn: boolean;
  /** Local master key for TenantCrypto (local development, tests, demo site). */
  cryptoLocalKey?: Buffer;
  /** Per-tenant data keys wrapped by Cloud KMS. With neither this nor a local key, encryption answers 503. */
  cryptoKms: boolean;
  /** Identity Platform whose ID tokens sign people in; undefined = sign-in unavailable (unless dev sign-in). */
  identityPlatform?: { projectId: string; apiKey: string; authDomain: string };
  email: EmailConfig;
}

export type EmailConfig = { provider: 'log' } | { provider: 'resend'; apiKey: string; from: string };

/** The tenant's own origin, e.g. https://acme.care.yutis.com.tw, for links in email and API answers. */
export function tenantOrigin(config: Pick<ApiConfig, 'cookieSecure' | 'tenantBaseDomain'>, slug: string): string {
  return `${config.cookieSecure ? 'https' : 'http'}://${slug}.${config.tenantBaseDomain}`;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid API configuration:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && e.AUTH_DEV_SIGN_IN && !e.DEMO_SITE) throw new Error('AUTH_DEV_SIGN_IN must not be enabled in production');
  if (production && !e.COOKIE_SECURE) throw new Error('COOKIE_SECURE must not be disabled in production');
  if (production && e.TENANT_CRYPTO_LOCAL_KEY && !e.DEMO_SITE) throw new Error('TENANT_CRYPTO_LOCAL_KEY must not be used in production');
  const cryptoLocalKey = e.TENANT_CRYPTO_LOCAL_KEY ? Buffer.from(e.TENANT_CRYPTO_LOCAL_KEY, 'base64') : undefined;
  if (cryptoLocalKey && cryptoLocalKey.length !== 32) throw new Error('TENANT_CRYPTO_LOCAL_KEY must be 32 bytes, base64-encoded');
  const identityPlatform = e.IDENTITY_PLATFORM_PROJECT_ID
    ? { projectId: e.IDENTITY_PLATFORM_PROJECT_ID, apiKey: e.IDENTITY_PLATFORM_API_KEY ?? '', authDomain: e.IDENTITY_PLATFORM_AUTH_DOMAIN ?? '' }
    : undefined;
  if (identityPlatform && (!identityPlatform.apiKey || !identityPlatform.authDomain)) {
    throw new Error('IDENTITY_PLATFORM_PROJECT_ID needs IDENTITY_PLATFORM_API_KEY and IDENTITY_PLATFORM_AUTH_DOMAIN');
  }
  if (identityPlatform && e.AUTH_DEV_SIGN_IN) throw new Error('Use either AUTH_DEV_SIGN_IN or Identity Platform, not both');
  if (cryptoLocalKey && e.TENANT_CRYPTO_KMS) throw new Error('Use either TENANT_CRYPTO_LOCAL_KEY or TENANT_CRYPTO_KMS, not both');
  if (e.EMAIL_PROVIDER === 'resend' && (!e.RESEND_API_KEY || !e.EMAIL_FROM)) throw new Error('EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM');
  return {
    production,
    demoSite: e.DEMO_SITE,
    port: e.PORT,
    databaseUrl: e.APP_DATABASE_URL,
    tenantBaseDomain: e.TENANT_BASE_DOMAIN.toLowerCase(),
    cookieSecure: e.COOKIE_SECURE,
    trustProxy: e.TRUST_PROXY,
    sessionIdleSeconds: e.SESSION_IDLE_MINUTES * 60,
    sessionMaxSeconds: e.SESSION_MAX_HOURS * 3600,
    devSignIn: e.AUTH_DEV_SIGN_IN,
    cryptoLocalKey,
    cryptoKms: e.TENANT_CRYPTO_KMS,
    identityPlatform,
    email: e.EMAIL_PROVIDER === 'resend' ? { provider: 'resend', apiKey: e.RESEND_API_KEY!, from: e.EMAIL_FROM! } : { provider: 'log' },
  };
}
