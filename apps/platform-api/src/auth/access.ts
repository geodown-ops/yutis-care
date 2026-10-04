/* Every route declares its access with exactly one of these; a route without one is refused. */
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse, ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorDto } from '../core/errors.js';
import type { Permission } from './permissions.js';

export type AccessRule = { kind: 'public' } | { kind: 'platform'; permission?: Permission };

export const ACCESS_RULE = 'yutis:platform-access-rule';
export const IAP_SECURITY = 'iap';
export const SIGN_IN_SECURITY = 'google-sign-in';

/** No sign-in: health checks and the sign-in page's settings only. */
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

const signedIn = (rule: AccessRule, forbidden: string) => applyDecorators(
  SetMetadata(ACCESS_RULE, rule),
  ApiSecurity(IAP_SECURITY),
  ApiSecurity(SIGN_IN_SECURITY),
  ApiUnauthorizedResponse({ description: '沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token）', type: ApiErrorDto }),
  ApiForbiddenResponse({ description: forbidden, type: ApiErrorDto }),
);

/** A signed-in, active platform user whose role has `permission`. */
export const Requires = (permission: Permission) =>
  signedIn({ kind: 'platform', permission }, '不是平台人員（not_platform_user），或角色沒有此權限');

/** Any signed-in, active platform user, whatever their role: who am I, what may I do. */
export const AnyPlatformUser = () => signedIn({ kind: 'platform' }, '不是平台人員（not_platform_user）');
