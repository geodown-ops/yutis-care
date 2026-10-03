/** Names under the product domain that belong to the platform, never to a tenant. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(['admin', 'api', 'www']);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The tenant slug for a request host: `acme.care.yutis.com.tw` → `acme`. Null for the bare domain, nested
 * subdomains, reserved names and other domains. Ignores the port and a trailing dot.
 */
export function tenantSlugFromHost(host: string | undefined, baseDomain: string): string | null {
  if (!host) return null;
  const name = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!name.endsWith(suffix)) return null;
  const slug = name.slice(0, -suffix.length);
  return LABEL.test(slug) && !RESERVED_SUBDOMAINS.has(slug) ? slug : null;
}
