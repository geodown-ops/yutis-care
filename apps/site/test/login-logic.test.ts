import { describe, expect, it } from 'vitest';
import { baseDomainFor, companyCodeFrom, loginTarget } from '../src/login-logic.js';

describe('baseDomainFor', () => {
  it('uses the host the site is on', () => {
    expect(baseDomainFor('care.yutis.net')).toBe('care.yutis.net');
    expect(baseDomainFor('www.care.yutis.net')).toBe('care.yutis.net');
    expect(baseDomainFor('staging-care.yutis.net')).toBe('staging-care.yutis.net');
    expect(baseDomainFor('care.example.com')).toBe('care.example.com');
  });

  it('falls back to production locally', () => {
    for (const host of ['localhost', 'site.localhost', '127.0.0.1', '192.168.1.20', '::1', '']) {
      expect(baseDomainFor(host)).toBe('care.yutis.net');
    }
  });
});

describe('companyCodeFrom', () => {
  it('takes the code from a bare code or a pasted address', () => {
    expect(companyCodeFrom(' DNCar ')).toBe('dncar');
    expect(companyCodeFrom('https://dncar.care.yutis.net/me')).toBe('dncar');
    expect(companyCodeFrom('dncar.care.yutis.net')).toBe('dncar');
  });
});

describe('loginTarget', () => {
  it('sends people to their company address', () => {
    expect(loginTarget('DNCar', 'care.yutis.net')).toEqual({ ok: true, code: 'dncar', url: 'https://dncar.care.yutis.net/' });
    expect(loginTarget('demo', 'localhost')).toEqual({ ok: true, code: 'demo', url: 'https://demo.care.yutis.net/' });
  });

  it('asks for a code', () => {
    expect(loginTarget('  ', 'care.yutis.net')).toEqual({ ok: false, error: '請輸入公司代碼' });
    expect(loginTarget('大南', 'care.yutis.net').ok).toBe(false);
  });
});
