import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { shouldRetry } from './api';
import { errorMessage, isForbidden, isMissingTenant } from './errors';

const apiError = (status: number, code: string) => new ApiRequestError(status, code, 'developer message');

describe('error messages', () => {
  it('uses the API code, never its developer message', () => {
    expect(errorMessage(apiError(409, 'subdomain_taken'))).toBe('這個子網域已經有租戶使用，請換一個。');
    expect(errorMessage(apiError(403, 'forbidden'))).toBe('你的平台角色沒有權限執行這個操作。');
    expect(errorMessage(apiError(403, 'not_platform_user'))).toContain('不是啟用中的平台人員');
    expect(errorMessage(apiError(409, 'templates_missing'))).toContain('預設範本');
    expect(errorMessage(apiError(400, 'cannot_change_self'))).toContain('自己');
    expect(errorMessage(apiError(400, 'validation_failed'))).not.toContain('developer');
  });

  it('falls back on the HTTP status for codes it does not know', () => {
    expect(errorMessage(apiError(404, 'not_found'))).toContain('找不到');
    expect(errorMessage(apiError(409, 'conflict'))).toContain('重新整理');
    expect(errorMessage(apiError(502, 'http_error'))).toContain('暫時無法使用');
    expect(errorMessage(apiError(418, 'teapot'))).toBe('操作沒有成功，請稍後再試。');
  });

  it('explains a request that never reached the API', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toContain('無法連線');
    expect(errorMessage(new Error('boom'))).toContain('未預期');
  });

  it('tells a missing permission from a missing account', () => {
    expect(isForbidden(apiError(403, 'forbidden'))).toBe(true);
    expect(isForbidden(apiError(403, 'not_platform_user'))).toBe(false);
    expect(isForbidden(new Error('x'))).toBe(false);
  });

  it('treats an unknown or malformed tenant id as not found', () => {
    expect(isMissingTenant(apiError(404, 'tenant_not_found'))).toBe(true);
    expect(isMissingTenant(apiError(400, 'bad_request'))).toBe(true);
    expect(isMissingTenant(apiError(500, 'internal_error'))).toBe(false);
  });
});

describe('query retries', () => {
  it('retries network errors and 5xx at most twice, never a 4xx', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, apiError(503, 'unavailable'))).toBe(true);
    expect(shouldRetry(2, apiError(503, 'unavailable'))).toBe(false);
    expect(shouldRetry(0, apiError(403, 'forbidden'))).toBe(false);
    expect(shouldRetry(0, apiError(404, 'tenant_not_found'))).toBe(false);
  });
});
