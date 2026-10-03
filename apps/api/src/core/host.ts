import { isValidTenantSlug } from '@yutis/domain';

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
  return isValidTenantSlug(slug) ? slug : null;
}
