import { describe, expect, it } from 'vitest';
import { ApiRequestError, createPlatformApi, createTenantApi, data } from './client';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('calls the typed tenant endpoints with path and query parameters', async () => {
    const calls: string[] = [];
    const api = createTenantApi({ baseUrl: 'http://demo.localhost', fetch: async req => { calls.push((req as Request).url); return json(200, []); } });
    await data(api.GET('/api/cases', { params: { query: { status: '處理中' } } }));
    await data(api.GET('/api/employees/{employeeId}/exams', { params: { path: { employeeId: 'e1' } } }));
    expect(calls).toEqual(['http://demo.localhost/api/cases?status=%E8%99%95%E7%90%86%E4%B8%AD', 'http://demo.localhost/api/employees/e1/exams']);
  });

  it('sends JSON bodies and accepts 204', async () => {
    let sent: unknown;
    const api = createTenantApi({ baseUrl: 'http://demo.localhost', fetch: async req => { sent = await (req as Request).json(); return new Response(null, { status: 204 }); } });
    await expect(data(api.POST('/api/auth/sign-in', { body: { token: 'nurse@demo.test', as: 'staff' } }))).resolves.toBeUndefined();
    expect(sent).toEqual({ token: 'nurse@demo.test', as: 'staff' });
  });

  it('turns error responses into ApiRequestError with the API code', async () => {
    const api = createTenantApi({ baseUrl: 'http://demo.localhost', fetch: async () => json(403, { status: 403, code: 'outside_sites', message: 'Outside sites' }) });
    const err = await data(api.GET('/api/me')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 403, code: 'outside_sites' });
  });

  it('falls back to http_error when the body is not the API error shape', async () => {
    const api = createPlatformApi({ baseUrl: 'http://admin.localhost', fetch: async () => new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }) });
    await expect(data(api.GET('/platform-api/tenants'))).rejects.toMatchObject({ status: 502, code: 'http_error' });
  });
});
