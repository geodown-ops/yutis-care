/* Trial applications from the marketing site (線上申請試用): what the review page shows and how 開通 starts. */
import { normalizeCompanyCode, TRIAL_DAYS, TRIAL_SEAT_LIMIT } from '@yutis/domain';
import type { TrialApplication } from './api';
import { dayBefore, type NewTenantForm } from './tenants';

/** ISO date `days` after `date`. */
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The onboarding form an approval starts from: the company and contact as applied, the preferred company code as the
 * subdomain, and a trial of TRIAL_DAYS days (ending the day before day TRIAL_DAYS + 1) capped at TRIAL_SEAT_LIMIT.
 */
export function trialToNewTenantForm(a: TrialApplication, today: string): NewTenantForm {
  return {
    name: a.companyName,
    subdomain: normalizeCompanyCode(a.preferredSubdomain ?? ''),
    planCode: '',
    subscriptionStatus: 'trial',
    seatLimit: TRIAL_SEAT_LIMIT,
    startsOn: today,
    endsOn: dayBefore(addDays(today, TRIAL_DAYS)),
    adminName: a.contactName,
    adminEmail: a.email,
  };
}

/** Name, tax id, contact or email contains the query (case-insensitive). */
export function matchesApplication(a: Pick<TrialApplication, 'companyName' | 'taxId' | 'contactName' | 'email'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || [a.companyName, a.taxId, a.contactName, a.email].some(v => v.toLowerCase().includes(q));
}
