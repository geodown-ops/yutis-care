/* Tenant subdomains (租戶子網域): {slug}.care.yutis.com.tw. The database enforces the same rule (tenants_slug_format). */

/** Names under the product domain that belong to the platform, never to a tenant. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(['admin', 'api', 'www']);

/**
 * demo.care.yutis.com.tw is the separate marketing demo deployment. Its own tenant is called `demo`, so the name is a
 * valid tenant slug there, but the production platform must never give it to a customer.
 */
export const DEMO_SITE_SUBDOMAIN = 'demo';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A single lower-case DNS label that is not reserved. */
export function isValidTenantSlug(slug: string): boolean {
  return LABEL.test(slug) && !RESERVED_SUBDOMAINS.has(slug);
}

/** A subdomain the platform may give a new tenant: a valid slug, and not the demo site's. */
export function isAvailableTenantSubdomain(slug: string): boolean {
  return isValidTenantSlug(slug) && slug !== DEMO_SITE_SUBDOMAIN;
}
