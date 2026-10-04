import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { employeeSignPath, signProblem, signView, type SignDocument } from './sign';

const doc = (d: Partial<SignDocument>): SignDocument =>
  ({ id: 's1', kind: 'signature', document: 'service_records', title: '', content: null, confirmedAt: null, comment: null, ...d });
const signer = { role: '勞工健康服務醫師', name: '張醫師' };

describe('sign link', () => {
  it('opens a 附表八 sign-off', () => {
    const content = { serviceOn: '2026-10-01', site: '桃園廠', record: { from: '09:00' }, signer };
    expect(signView(doc({ content }))).toEqual({ kind: 'service', content });
  });

  it('opens a violence-prevention review sign-off', () => {
    const content = { reviewedOn: '2026-10-02', site: '桃園廠', department: '製造一課', items: [{ item: '辨識及評估危害', points: ['組織'], result: '已完成', fix: '' }], signer };
    expect(signView(doc({ document: 'violence_reviews', content }))).toEqual({ kind: 'review', content });
  });

  it('sends employee confirmations to the employee portal', () => {
    const content = { interviewedOn: '2026-10-01', fitAdvice: '可', limits: [], agreedArrangement: null };
    expect(signView(doc({ kind: 'acknowledgement', document: 'employee_acknowledgements', content }))).toEqual({ kind: 'employee' });
    expect(employeeSignPath('a_b-c')).toBe('/me/sign/a_b-c');
  });

  it('says so when the record behind the link is gone or does not match its kind', () => {
    expect(signView(doc({ content: null }))).toEqual({ kind: 'missing' });
    expect(signView(doc({ document: 'violence_reviews', content: { serviceOn: null, site: null, record: null, signer } }))).toEqual({ kind: 'missing' });
  });

  it('explains used, expired and unknown links', () => {
    expect(signProblem(new ApiRequestError(410, 'token_used', ''))).toContain('已經使用過');
    expect(signProblem(new ApiRequestError(410, 'token_expired', ''))).toContain('過期');
    expect(signProblem(new ApiRequestError(404, 'token_not_found', ''))).toContain('找不到');
    expect(signProblem(new TypeError('Failed to fetch'))).toContain('網路');
  });
});
