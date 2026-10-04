import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { ackContent, isSignOff, linkProblem } from './SignLinkPage';

const signer = { role: '職醫', name: '張醫師' };
const interview = { interviewedOn: '2026-10-01', fitAdvice: '可', limits: [], agreedArrangement: '調整夜班' };

describe('emailed confirmation links', () => {
  it('tells a used, expired and malformed link apart, and leaves other failures to a retry', () => {
    expect(linkProblem(new ApiRequestError(410, 'token_used', 'used'))).toBe('linkUsed');
    expect(linkProblem(new ApiRequestError(410, 'token_expired', 'expired'))).toBe('linkExpired');
    expect(linkProblem(new ApiRequestError(404, 'token_not_found', 'unknown'))).toBe('linkInvalid');
    expect(linkProblem(new ApiRequestError(503, 'http_error', 'down'))).toBeNull();
    expect(linkProblem(new TypeError('offline'))).toBeNull();
  });

  it('sends sign-offs (附表八, violence-prevention reviews) to the back office', () => {
    expect(isSignOff({ kind: 'signature' })).toBe(true);
    expect(isSignOff({ kind: 'acknowledgement' })).toBe(false);
  });

  it('reads the interview record only from an employee acknowledgement', () => {
    expect(ackContent({ document: 'employee_acknowledgements', content: interview })).toBe(interview);
    expect(ackContent({ document: 'employee_acknowledgements', content: null })).toBeNull();
    expect(ackContent({ document: 'service_records', content: { serviceOn: '2026-10-01', site: '新竹廠', record: {}, signer } })).toBeNull();
    expect(ackContent({ document: 'violence_reviews', content: { reviewedOn: null, site: null, department: null, items: [], signer } })).toBeNull();
  });
});
