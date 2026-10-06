import { describe, expect, it } from 'vitest';
import { isFreeMailAddress, isPlausiblePhone, isValidTaxId, normalizeCompanyCode } from '../src/index.js';

describe('trial applications', () => {
  it('checks the 統一編號 check digit', () => {
    expect(isValidTaxId('04595257')).toBe(true);
    expect(isValidTaxId('22099131')).toBe(true);
    expect(isValidTaxId('10458575')).toBe(true); // seventh digit 7
    expect(isValidTaxId('04595258')).toBe(false);
    expect(isValidTaxId('1234567')).toBe(false);
    expect(isValidTaxId('abcdefgh')).toBe(false);
  });
  it('rejects free mailboxes, whatever the case', () => {
    expect(isFreeMailAddress('someone@Gmail.com')).toBe(true);
    expect(isFreeMailAddress('a@yahoo.com.tw')).toBe(true);
    expect(isFreeMailAddress('hr@dncar.com.tw')).toBe(false);
  });
  it('accepts phone numbers as people type them', () => {
    expect(isPlausiblePhone('02-2345-6789')).toBe(true);
    expect(isPlausiblePhone('(02) 2345 6789 #123')).toBe(true);
    expect(isPlausiblePhone('+886 912 345 678')).toBe(true);
    expect(isPlausiblePhone('12345')).toBe(false);
    expect(isPlausiblePhone('call me')).toBe(false);
  });
  it('turns a preferred company code into a subdomain candidate', () => {
    expect(normalizeCompanyCode(' DNCar ')).toBe('dncar');
    expect(normalizeCompanyCode('-大南 car-')).toBe('car');
  });
});
