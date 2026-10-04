import { describe, expect, it } from 'vitest';
import { createPlatformApi } from '@yutis/api-client';
import { fetchSignInConfig, googleSignIn, googleSignInProblem } from './auth';

const answer = (status: number, body?: unknown) => createPlatformApi({
  baseUrl: 'http://admin.test',
  fetch: (async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch,
});

describe('platform sign-in config', () => {
  it('reads the method', async () => {
    expect(await fetchSignInConfig(answer(200, { method: 'google', apiKey: 'k', authDomain: 'p.firebaseapp.com' }))).toEqual({ method: 'google', apiKey: 'k', authDomain: 'p.firebaseapp.com' });
    expect(await fetchSignInConfig(answer(200, { method: 'dev' }))).toEqual({ method: 'dev' });
    await expect(fetchSignInConfig(answer(503))).rejects.toThrow();
  });

  it('uses Google sign-in only when the API hands over its settings', () => {
    expect(googleSignIn({ method: 'google', apiKey: 'k', authDomain: 'p.firebaseapp.com' })).toEqual({ apiKey: 'k', authDomain: 'p.firebaseapp.com' });
    expect(googleSignIn({ method: 'google' })).toBeNull();
    expect(googleSignIn({ method: 'iap' })).toBeNull();
    expect(googleSignIn({ method: 'dev', apiKey: 'k', authDomain: 'd' })).toBeNull();
  });

  it('says nothing when the popup is closed and explains the rest', () => {
    expect(googleSignInProblem({ code: 'auth/popup-closed-by-user' })).toBeNull();
    expect(googleSignInProblem({ code: 'auth/popup-blocked' })).toContain('彈出視窗');
    expect(googleSignInProblem({ code: 'auth/unauthorized-domain' })).toContain('工程同仁');
    expect(googleSignInProblem(new Error('x'))).toBe('登入沒有成功，請再試一次。');
  });
});
