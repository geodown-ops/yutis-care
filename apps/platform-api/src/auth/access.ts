/* Every route declares its access with exactly one of these; a route without one is refused. */
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse, ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorDto } from '../core/errors.js';
import type { Permission } from './permissions.js';

export type AccessRule = { kind: 'public' } | { kind: 'platform'; permission: Permission };

export const ACCESS_RULE = 'yutis:platform-access-rule';
export const IAP_SECURITY = 'iap';

/** No sign-in: health checks only. */
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

/** A signed-in, active platform user whose role has `permission`. */
export const Requires = (permission: Permission) => applyDecorators(
  SetMetadata(ACCESS_RULE, { kind: 'platform', permission } satisfies AccessRule),
  ApiSecurity(IAP_SECURITY),
  ApiUnauthorizedResponse({ description: '沒有經過 Identity-Aware Proxy 的有效身分', type: ApiErrorDto }),
  ApiForbiddenResponse({ description: '不是平台人員（not_platform_user），或角色沒有此權限', type: ApiErrorDto }),
);
