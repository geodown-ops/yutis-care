/* /login/: turn a company code into that company's own sign-in address ({code}.care.yutis.net). */
import { normalizeCompanyCode } from '@yutis/domain';

export const DEFAULT_BASE_DOMAIN = 'care.yutis.net';

function isLocal(host: string): boolean {
  return !host || host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':');
}

/**
 * The domain tenants live under. The site itself lives on the bare base domain (care.yutis.net, or a staging base), so
 * any real host is the base; local development falls back to production's.
 */
export function baseDomainFor(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  if (host.endsWith(DEFAULT_BASE_DOMAIN)) return host;
  return isLocal(host) ? DEFAULT_BASE_DOMAIN : host;
}

/** The code from what someone typed: a bare code, or a pasted address such as https://dncar.care.yutis.net/me. */
export function companyCodeFrom(input: string): string {
  const label = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[./?#]/)[0] ?? '';
  return normalizeCompanyCode(label);
}

export type LoginTarget = { ok: true; code: string; url: string } | { ok: false; error: string };

export function loginTarget(input: string, hostname: string): LoginTarget {
  if (!input.trim()) return { ok: false, error: '請輸入公司代碼' };
  const code = companyCodeFrom(input);
  if (!code) return { ok: false, error: '公司代碼由英文字母、數字或連字號（-）組成' };
  return { ok: true, code, url: `https://${code}.${baseDomainFor(hostname)}/` };
}
