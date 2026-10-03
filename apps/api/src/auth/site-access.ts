/*
 * Site scope (廠區範圍): staff see employees only in the sites they are responsible for, plus sites they hold an
 * unexpired break-glass grant for (破窗存取). Row-Level Security covers the tenant; this covers the site.
 */
import { ForbiddenException } from '@nestjs/common';
import { breakGlassGrants, sites, userSiteScopes, type Tx } from '@yutis/db';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { StaffPrincipal } from '../core/context.js';

export interface SiteAccess {
  assigned: { id: string; code: string; name: string }[];
  breakGlass: { id: string; code: string; name: string; expiresAt: Date }[];
}

export async function siteAccess(tx: Tx, userId: string): Promise<SiteAccess> {
  const site = { id: sites.id, code: sites.code, name: sites.name };
  const assigned = await tx.select(site).from(userSiteScopes)
    .innerJoin(sites, and(eq(sites.tenantId, userSiteScopes.tenantId), eq(sites.id, userSiteScopes.siteId)))
    .where(eq(userSiteScopes.userId, userId))
    .orderBy(asc(sites.code));
  const breakGlass = await tx.select({ ...site, expiresAt: breakGlassGrants.expiresAt }).from(breakGlassGrants)
    .innerJoin(sites, and(eq(sites.tenantId, breakGlassGrants.tenantId), eq(sites.id, breakGlassGrants.siteId)))
    .where(and(eq(breakGlassGrants.userId, userId), isNull(breakGlassGrants.revokedAt), gt(breakGlassGrants.expiresAt, sql`now()`)))
    .orderBy(asc(sites.code));
  return { assigned, breakGlass };
}

/** 403 unless the staff member may see employees of `siteId`. Use on every route about one employee. */
export async function assertSiteAccess(tx: Tx, principal: StaffPrincipal, siteId: string): Promise<void> {
  const { rows } = await tx.execute<{ ok: boolean }>(sql`select
    exists (select 1 from ${userSiteScopes} where ${userSiteScopes.userId} = ${principal.userId} and ${userSiteScopes.siteId} = ${siteId})
    or exists (select 1 from ${breakGlassGrants} where ${breakGlassGrants.userId} = ${principal.userId} and ${breakGlassGrants.siteId} = ${siteId}
      and ${breakGlassGrants.revokedAt} is null and ${breakGlassGrants.expiresAt} > now()) as ok`);
  if (!rows[0]?.ok) throw new ForbiddenException('Outside your sites');
}
