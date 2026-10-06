import { describe, expect, it } from 'vitest';
import type { TrialApplication } from './api';
import { matchesApplication, trialToNewTenantForm } from './trials';

const application: TrialApplication = {
  id: 'a1', status: 'pending', companyName: '大南汽車股份有限公司', taxId: '04595257', employeeRange: '100-299', contactName: '林小姐',
  contactTitle: '人資經理', email: 'hr@dnmotor.test', phone: '02-2345-6789', preferredSubdomain: 'DN-Motor', identityProvider: 'microsoft',
  createdAt: '2026-10-06T01:00:00Z', decidedAt: null, decidedBy: null, declineReason: null, tenantId: null,
};

describe('trial applications', () => {
  it('starts 開通 as a 30-day trial for up to 100 employees, with the contact as first admin', () => {
    expect(trialToNewTenantForm(application, '2026-10-06')).toEqual({
      name: '大南汽車股份有限公司', subdomain: 'dn-motor', planCode: '', subscriptionStatus: 'trial', seatLimit: 100,
      startsOn: '2026-10-06', endsOn: '2026-11-04', adminName: '林小姐', adminEmail: 'hr@dnmotor.test',
    });
    expect(trialToNewTenantForm({ ...application, preferredSubdomain: null }, '2026-10-06').subdomain).toBe('');
  });
  it('searches name, tax id, contact and email', () => {
    expect(matchesApplication(application, '大南')).toBe(true);
    expect(matchesApplication(application, '0459')).toBe(true);
    expect(matchesApplication(application, 'DNMOTOR')).toBe(true);
    expect(matchesApplication(application, 'acme')).toBe(false);
  });
});
