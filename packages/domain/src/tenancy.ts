/* Tenant subdomains (租戶子網域): {slug}.care.yutis.com.tw. The database enforces the same rule (tenants_slug_format). */

/** Names under the product domain that belong to the platform, never to a tenant. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(['admin', 'api', 'www']);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A single lower-case DNS label that is not reserved. */
export function isValidTenantSlug(slug: string): boolean {
  return LABEL.test(slug) && !RESERVED_SUBDOMAINS.has(slug);
}
