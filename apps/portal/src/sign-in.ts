import { STAFF_TEXT, type SignInText } from '@yutis/sign-in';
import type { TFunction } from 'i18next';

/** Search params of /login: where to go back to, and whether an idle session just ended. */
export interface LoginSearch { redirect?: string; expired?: boolean }

export function loginSearch(s: Record<string, unknown>): LoginSearch {
  return {
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    expired: s.expired === true || s.expired === 'true' ? true : undefined,
  };
}

/** Only a path inside the portal; anything else (another site, //host, /login itself) goes to the task list. */
export function safeRedirect(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return '/';
  return raw;
}

/** The shared sign-in page's text in the current language. Keys follow the back office's STAFF_TEXT. */
export function signInText(t: TFunction<'app'>): SignInText {
  const { problems, ...rest } = STAFF_TEXT;
  const text = Object.fromEntries(Object.keys(rest).map(k => [k, t(`signIn.${k}`)])) as Omit<SignInText, 'problems'>;
  return { ...text, problems: Object.fromEntries(Object.keys(problems).map(k => [k, t(`signIn.problems.${k}`)])) as SignInText['problems'] };
}
