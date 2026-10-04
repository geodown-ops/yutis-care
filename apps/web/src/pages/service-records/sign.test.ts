import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { readSignDocument, signProblem } from './sign';

describe('sign link', () => {
  it('reads a 附表八 sign-off document', () => {
    const d = readSignDocument({
      id: 's1', title: '勞工健康服務執行紀錄表（附表八）', confirmedAt: null, comment: null,
      content: { serviceOn: '2026-10-01', site: '桃園廠', record: { from: '09:00' }, signer: { role: '勞工健康服務醫師', name: '張醫師' } },
    });
    expect(d).toEqual({ serviceOn: '2026-10-01', site: '桃園廠', record: { from: '09:00' }, signer: { role: '勞工健康服務醫師', name: '張醫師' } });
  });

  it('recognises an employee confirmation as not a sign-off', () => {
    expect(readSignDocument({ id: 'a1', title: '母性健康保護面談紀錄', confirmedAt: null, comment: null, content: { interviewedOn: '2026-10-01', fitAdvice: '' } })).toBeNull();
  });

  it('explains used, expired and unknown links', () => {
    expect(signProblem(new ApiRequestError(410, 'token_used', ''))).toContain('已經使用過');
    expect(signProblem(new ApiRequestError(410, 'token_expired', ''))).toContain('過期');
    expect(signProblem(new ApiRequestError(404, 'token_not_found', ''))).toContain('找不到');
    expect(signProblem(new TypeError('Failed to fetch'))).toContain('網路');
  });
});
