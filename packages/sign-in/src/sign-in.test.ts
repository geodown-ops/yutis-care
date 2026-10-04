import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { signInProblem } from './errors';
import { isEmailLink, providerKind } from './identity';
import { fill, STAFF_TEXT } from './text';

describe('sign-in helpers', () => {
  it('recognises Identity Platform email links', () => {
    expect(isEmailLink('https://acme.care.yutis.net/login?apiKey=k&oobCode=abc&mode=signIn&tenantId=t1')).toBe(true);
    expect(isEmailLink('https://acme.care.yutis.net/login?redirect=%2Fcases')).toBe(false);
    expect(isEmailLink('https://acme.care.yutis.net/login?mode=resetPassword&oobCode=abc')).toBe(false);
  });

  it('picks the provider type from its id', () => {
    expect(providerKind('saml.acme')).toBe('saml');
    expect(providerKind('google.com')).toBe('google');
    expect(providerKind('oidc.acme-entra')).toBe('oauth');
    expect(providerKind('microsoft.com')).toBe('oauth');
  });

  it('explains API and provider errors, and stays quiet when the popup is closed', () => {
    expect(signInProblem(new ApiRequestError(401, 'unauthorized', 'x'))).toBe('noAccount');
    expect(signInProblem(new ApiRequestError(503, 'sign_in_unavailable', 'x'))).toBe('notConfigured');
    expect(signInProblem(new ApiRequestError(403, 'tenant_inactive', 'x'))).toBe('tenantInactive');
    expect(signInProblem({ code: 'auth/popup-closed-by-user' })).toBeNull();
    expect(signInProblem({ code: 'auth/expired-action-code' })).toBe('linkInvalid');
    expect(signInProblem(new TypeError('Failed to fetch'))).toBe('failed');
  });

  it('fills placeholders and has text for every problem', () => {
    expect(fill(STAFF_TEXT.sso, { provider: 'Google' })).toBe('使用 Google 登入');
    for (const v of Object.values(STAFF_TEXT.problems)) expect(v).not.toBe('');
  });
});
