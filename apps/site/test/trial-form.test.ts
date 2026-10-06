import { describe, expect, it } from 'vitest';
import {
  buildTrialRequest,
  FREE_MAIL_MESSAGE,
  interpretTrialResponse,
  subdomainPreview,
  TAX_ID_MESSAGE,
  validateTrialForm,
  type TrialFormValues,
} from '../src/trial-form.js';

const valid: TrialFormValues = {
  companyName: ' 大南汽車股份有限公司 ',
  taxId: '04595257',
  employeeRange: '100-299',
  contactName: '王小明',
  contactTitle: '職安衛主管',
  email: ' HR@DNCar.com.tw ',
  phone: '02-2345-6789',
  preferredSubdomain: ' DNCar ',
  identityProvider: 'microsoft',
  consent: true,
  website: '',
};

describe('validateTrialForm', () => {
  it('accepts a complete application', () => {
    expect(validateTrialForm(valid)).toEqual({});
  });

  it('accepts the optional fields left empty', () => {
    expect(validateTrialForm({ ...valid, preferredSubdomain: '', identityProvider: '' })).toEqual({});
  });

  it('asks for every required field', () => {
    const errors = validateTrialForm({ ...valid, companyName: ' ', taxId: '', employeeRange: '', contactName: '', contactTitle: '', email: '', phone: '', consent: false });
    expect(Object.keys(errors).sort()).toEqual(['companyName', 'consent', 'contactName', 'contactTitle', 'email', 'employeeRange', 'phone', 'taxId']);
    expect(errors.companyName).toBe('請填寫公司名稱');
  });

  it('checks the 統一編號 length and check digit', () => {
    expect(validateTrialForm({ ...valid, taxId: '1234567' }).taxId).toBe('統一編號是 8 位數字');
    expect(validateTrialForm({ ...valid, taxId: '04595258' }).taxId).toBe(TAX_ID_MESSAGE);
    expect(validateTrialForm({ ...valid, taxId: '０４５９５２５７' }).taxId).toBeUndefined();
  });

  it('rejects free mailboxes and malformed addresses', () => {
    expect(validateTrialForm({ ...valid, email: 'someone@gmail.com' }).email).toBe(FREE_MAIL_MESSAGE);
    expect(validateTrialForm({ ...valid, email: 'not-an-email' }).email).toBe('Email 格式不正確');
  });

  it('rejects phone numbers that are not', () => {
    expect(validateTrialForm({ ...valid, phone: 'call me' }).phone).toMatch(/電話格式不正確/);
  });

  it('rejects a company code with nothing usable in it', () => {
    expect(validateTrialForm({ ...valid, preferredSubdomain: '大南' }).preferredSubdomain).toBeDefined();
  });

  it('enforces the API length limits', () => {
    expect(validateTrialForm({ ...valid, companyName: 'x'.repeat(101) }).companyName).toBe('公司名稱最多 100 個字');
    expect(validateTrialForm({ ...valid, contactTitle: 'x'.repeat(51) }).contactTitle).toBeDefined();
  });

  it('rejects an unknown size or account system', () => {
    expect(validateTrialForm({ ...valid, employeeRange: '5000+' }).employeeRange).toBe('請選擇員工人數');
    expect(validateTrialForm({ ...valid, identityProvider: 'okta' }).identityProvider).toBeDefined();
  });
});

describe('buildTrialRequest', () => {
  it('trims, normalizes and adds the bot checks', () => {
    expect(buildTrialRequest({ ...valid, taxId: '0459 5257' }, 12_345.6)).toEqual({
      companyName: '大南汽車股份有限公司',
      taxId: '04595257',
      employeeRange: '100-299',
      contactName: '王小明',
      contactTitle: '職安衛主管',
      email: 'hr@dncar.com.tw',
      phone: '02-2345-6789',
      preferredSubdomain: 'dncar',
      identityProvider: 'microsoft',
      consent: true,
      website: '',
      elapsedMs: 12_346,
    });
  });

  it('sends null for optional fields left empty, and the honeypot as typed', () => {
    const body = buildTrialRequest({ ...valid, preferredSubdomain: '  ', identityProvider: '', website: 'http://spam' }, 5000);
    expect(body.preferredSubdomain).toBeNull();
    expect(body.identityProvider).toBeNull();
    expect(body.website).toBe('http://spam');
  });
});

describe('subdomainPreview', () => {
  it('shows the address the code would become', () => {
    expect(subdomainPreview(' DNCar ')).toBe('dncar.care.yutis.net');
    expect(subdomainPreview('大南')).toBeNull();
    expect(subdomainPreview('')).toBeNull();
  });
});

describe('interpretTrialResponse', () => {
  it('treats 202 as received', () => {
    expect(interpretTrialResponse(202, { status: 'received' })).toEqual({ kind: 'received' });
  });

  it('points free_mail and invalid_tax_id at their fields', () => {
    expect(interpretTrialResponse(400, { status: 400, code: 'free_mail', message: 'x' })).toEqual({ kind: 'field', field: 'email', message: FREE_MAIL_MESSAGE });
    expect(interpretTrialResponse(400, { status: 400, code: 'invalid_tax_id', message: 'x' })).toEqual({ kind: 'field', field: 'taxId', message: TAX_ID_MESSAGE });
  });

  it('gives a general message for other validation failures', () => {
    const outcome = interpretTrialResponse(400, { status: 400, code: 'validation_failed', message: 'x', issues: [] });
    expect(outcome).toMatchObject({ kind: 'error', contact: true });
  });

  it('asks people to wait after too many applications', () => {
    expect(interpretTrialResponse(429, null)).toEqual({ kind: 'error', message: '申請次數過多，請稍後再試。', contact: false });
  });

  it('offers the contact address when the request fails', () => {
    for (const status of [0, 500, 502]) {
      const outcome = interpretTrialResponse(status, null);
      expect(outcome.kind).toBe('error');
      if (outcome.kind === 'error') expect(outcome.message).toContain('care@yutis.net');
    }
  });
});
