import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { isServiceSignOff, linkProblem } from './SignLinkPage';

describe('emailed confirmation links', () => {
  it('tells a used, expired and malformed link apart, and leaves other failures to a retry', () => {
    expect(linkProblem(new ApiRequestError(410, 'token_used', 'used'))).toBe('linkUsed');
    expect(linkProblem(new ApiRequestError(410, 'token_expired', 'expired'))).toBe('linkExpired');
    expect(linkProblem(new ApiRequestError(404, 'token_not_found', 'unknown'))).toBe('linkInvalid');
    expect(linkProblem(new ApiRequestError(503, 'http_error', 'down'))).toBeNull();
    expect(linkProblem(new TypeError('offline'))).toBeNull();
  });

  it('recognises a 附表八 sign-off, which belongs on the back office', () => {
    expect(isServiceSignOff({ serviceOn: '2026-10-01', record: {}, signer: { role: '職醫', name: '張醫師' } })).toBe(true);
    expect(isServiceSignOff({ interviewedOn: '2026-10-01', fitAdvice: '可', limits: [], agreedArrangement: '調整夜班' })).toBe(false);
  });
});
