import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform(v => v === 'true');

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Login role that is a member of `yutis_platform` (never yutis_app, never the table owner). */
  PLATFORM_DATABASE_URL: z.string().min(1),
  /** Tenants are served at {slug}.{TENANT_BASE_DOMAIN}; used for links in invitations. */
  TENANT_BASE_DOMAIN: z.string().min(1).default('care.yutis.com.tw'),
  /** Identity-Aware Proxy audience: /projects/{number}/global/backendServices/{id}. Required in production. */
  IAP_AUDIENCE: z.string().min(1).optional(),
  /** Behind the Google Cloud load balancer: take the client IP from X-Forwarded-For. */
  TRUST_PROXY: flag.default(false),
  /** Accept `X-Dev-Platform-User: <email>` instead of the IAP header. Local development only. */
  PLATFORM_DEV_AUTH: flag.default(false),
  /** Fake Cloud KMS, Identity Platform and email that only log. Local development and tests only. */
  PLATFORM_FAKE_INTEGRATIONS: flag.default(false),
});

export interface PlatformConfig {
  production: boolean;
  port: number;
  databaseUrl: string;
  tenantBaseDomain: string;
  iapAudience?: string;
  trustProxy: boolean;
  devAuth: boolean;
  fakeIntegrations: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): PlatformConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid platform API configuration:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && e.PLATFORM_DEV_AUTH) throw new Error('PLATFORM_DEV_AUTH must not be enabled in production');
  if (production && e.PLATFORM_FAKE_INTEGRATIONS) throw new Error('PLATFORM_FAKE_INTEGRATIONS must not be enabled in production');
  if (!e.PLATFORM_DEV_AUTH && !e.IAP_AUDIENCE) throw new Error('IAP_AUDIENCE is required unless PLATFORM_DEV_AUTH is on');
  return {
    production,
    port: e.PORT,
    databaseUrl: e.PLATFORM_DATABASE_URL,
    tenantBaseDomain: e.TENANT_BASE_DOMAIN.toLowerCase(),
    iapAudience: e.IAP_AUDIENCE,
    trustProxy: e.TRUST_PROXY,
    devAuth: e.PLATFORM_DEV_AUTH,
    fakeIntegrations: e.PLATFORM_FAKE_INTEGRATIONS,
  };
}
