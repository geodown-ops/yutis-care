import { describe, expect, it } from 'vitest';
import { ApiRequestError, createApiClient } from './client';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('calls same-origin endpoints under /api', async () => {
    const calls: string[] = [];
    const api = createApiClient('/api', async input => { calls.push(String(input)); return json(200, { id: 't1' }); });
    await api.tenant();
    await api.me();
    expect(calls).toEqual(['/api/tenant', '/api/me']);
  });

  it('turns error responses into ApiRequestError', async () => {
    const api = createApiClient('/api', async () => json(403, { code: 'forbidden', message: '沒有權限' }));
    await expect(api.me()).rejects.toBeInstanceOf(ApiRequestError);
    await expect(api.me()).rejects.toMatchObject({ error: { status: 403, code: 'forbidden' } });
  });
});
