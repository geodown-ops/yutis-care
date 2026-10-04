/*
 * The platform API (/platform-api, same origin). In production Identity-Aware Proxy signs every request, so the app
 * sends no credentials of its own; the dev server's proxy adds the local stand-in header (vite.config.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { ApiRequestError, createPlatformApi, data, type PlatformSchemas } from '@yutis/api-client';

export const api = createPlatformApi();

export type Tenant = PlatformSchemas['TenantDto'];
export type TenantDetail = PlatformSchemas['TenantDetailDto'];
export type Subscription = PlatformSchemas['SubscriptionDto'];
export type Plan = PlatformSchemas['PlanDto'];
export type Usage = PlatformSchemas['UsageDto'];
export type Announcement = PlatformSchemas['AnnouncementDto'];
export type PlatformUser = PlatformSchemas['PlatformUserDto'];
export type TemplateVersion = PlatformSchemas['TemplateVersionDto'];

export type TenantStatus = Tenant['status'];
export type SubscriptionStatus = Subscription['status'];
export type AnnouncementKind = Announcement['kind'];
export type PlatformRole = PlatformUser['role'];
export type TemplateKind = TemplateVersion['kind'];

/** Retry network hiccups and 5xx, never a 4xx: the answer will not change and the error should show at once. */
export const shouldRetry = (failures: number, error: unknown) =>
  failures < 2 && !(error instanceof ApiRequestError && error.status < 500);

export const tenantsQuery = queryOptions({
  queryKey: ['tenants'],
  queryFn: () => data(api.GET('/platform-api/tenants')),
});

export const tenantQuery = (id: string) => queryOptions({
  queryKey: ['tenants', id],
  queryFn: () => data(api.GET('/platform-api/tenants/{id}', { params: { path: { id } } })),
});

export const plansQuery = queryOptions({
  queryKey: ['plans'],
  queryFn: () => data(api.GET('/platform-api/plans')),
  staleTime: 5 * 60_000,
});

/** `month` is YYYY-MM. */
export const usageQuery = (month: string) => queryOptions({
  queryKey: ['usage', month],
  queryFn: () => data(api.GET('/platform-api/usage', { params: { query: { month } } })),
});

export const announcementsQuery = queryOptions({
  queryKey: ['announcements'],
  queryFn: () => data(api.GET('/platform-api/announcements')),
});

export const platformUsersQuery = queryOptions({
  queryKey: ['platform-users'],
  queryFn: () => data(api.GET('/platform-api/platform-users')),
});

export const templatesQuery = queryOptions({
  queryKey: ['templates'],
  queryFn: () => data(api.GET('/platform-api/templates')),
});
