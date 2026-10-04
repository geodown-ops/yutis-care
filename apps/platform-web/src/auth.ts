/*
 * How platform staff are identified (GET /platform-api/sign-in-config). Behind Identity-Aware Proxy (Google Cloud) and
 * on the dev server the app does nothing: IAP or the dev proxy vouches for every request. With Google sign-in (Railway,
 * or Google Cloud without a Workspace organization) the app shows a sign-in page and sends the person's ID token with
 * every request (api.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { data, type PlatformApi, type PlatformSchemas } from '@yutis/api-client';
import { platformAccount, type PlatformSignInConfig } from '@yutis/sign-in';
import { api } from './api';

export type SignInConfig = PlatformSchemas['SignInConfigDto'];

/** Public: asked before anyone has signed in, so no token goes with it. */
export const fetchSignInConfig = (client: PlatformApi = api): Promise<SignInConfig> => data(client.GET('/platform-api/sign-in-config'));

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
