import { STAFF_TEXT } from '@yutis/sign-in';
import { describe, expect, it } from 'vitest';
import i18n, { LANG_CODES } from './i18n';
import { loginSearch, safeRedirect, signInText } from './sign-in';

describe('sign-in', () => {
  it('only goes back to a path inside the portal', () => {
    expect(safeRedirect('/tasks/nmq/1?x=1')).toBe('/tasks/nmq/1?x=1');
    expect(safeRedirect('/health')).toBe('/health');
    for (const bad of [undefined, '', 'https://evil.example', '//evil.example/x', '/\\evil.example', 'health', '/login', '/login?redirect=/x']) {
      expect(safeRedirect(bad), String(bad)).toBe('/');
    }
  });

  it('reads the search params it understands', () => {
    expect(loginSearch({ redirect: '/health', expired: true })).toEqual({ redirect: '/health', expired: true });
    expect(loginSearch({ redirect: 5, expired: 'no', other: 1 })).toEqual({ redirect: undefined, expired: undefined });
  });

  it('translates every text the sign-in page shows, in every language', () => {
    for (const l of LANG_CODES) {
      const text = signInText(i18n.getFixedT(l));
      expect(Object.keys(text).sort(), l).toEqual(Object.keys(STAFF_TEXT).sort());
      expect(Object.keys(text.problems).sort(), l).toEqual(Object.keys(STAFF_TEXT.problems).sort());
      for (const v of [...Object.values(text).filter(x => typeof x === 'string'), ...Object.values(text.problems)]) {
        expect(v, l).not.toMatch(/^signIn\./);
      }
    }
    // The page fills these placeholders itself, so i18next must leave them alone.
    expect(signInText(i18n.getFixedT('en')).sso).toBe('Sign in with {provider}');
    expect(signInText(i18n.getFixedT('zh')).problems.noAccount).toContain('公司登記');
  });
});
