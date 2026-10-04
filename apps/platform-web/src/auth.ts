/*
 * How platform staff are identified (GET /platform-api/sign-in-config). Behind Identity-Aware Proxy (Google Cloud) and
 * on the dev server the app does nothing: IAP or the dev proxy vouches for every request. With Google sign-in
 * (Railway) the app shows a sign-in page and sends the person's ID token with every request (api.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { platformAccount, type PlatformSignInConfig } from '@yutis/sign-in';

export interface SignInConfig { method: 'iap' | 'google' | 'dev'; apiKey?: string; authDomain?: string }

/**
 * A plain fetch: the endpoint is public and newer than the generated client. A platform API without it (404) predates
 * Google sign-in, so it is guarded by IAP or runs locally.
 */
export async function fetchSignInConfig(fetcher: typeof fetch = fetch): Promise<SignInConfig> {
  const res = await fetcher('/platform-api/sign-in-config', { credentials: 'same-origin' });
  if (res.status === 404) return { method: 'iap' };
  if (!res.ok) throw new Error(`sign-in-config ${res.status}`);
  return (await res.json()) as SignInConfig;
}

export const signInConfigQuery = queryOptions({ queryKey: ['sign-in-config'], queryFn: () => fetchSignInConfig(), staleTime: Infinity, gcTime: Infinity });

/** The Firebase settings when this deployment uses Google sign-in, else null. */
export function googleSignIn(c: SignInConfig): PlatformSignInConfig | null {
  return c.method === 'google' && c.apiKey && c.authDomain ? { apiKey: c.apiKey, authDomain: c.authDomain } : null;
}

let unauthorized: (() => void) | null = null;

/** What to do when the API refuses the token (401); only Google sign-in registers anything. */
export function onUnauthorized(handler: (() => void) | null) { unauthorized = handler; }
export function signalUnauthorized() { unauthorized?.(); }

export const accountQuery = (cfg: PlatformSignInConfig) =>
  queryOptions({ queryKey: ['platform-account'], queryFn: () => platformAccount(cfg), staleTime: Infinity });

/** Why the Google popup did not sign the person in, in plain Chinese; null when they simply closed it. */
export function googleSignInProblem(err: unknown): string | null {
  switch ((err as { code?: unknown } | null)?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/popup-blocked':
      return '瀏覽器擋住了登入視窗。請允許這個網站開啟彈出視窗，再按一次登入。';
    case 'auth/unauthorized-domain':
      return '這個網址還沒加入登入設定，請聯絡工程同仁。';
    case 'auth/network-request-failed':
      return '連不上登入服務，請檢查網路後再試一次。';
    case 'auth/user-disabled':
      return '這個 Google 帳號已被停用。';
    default:
      return '登入沒有成功，請再試一次。';
  }
}
