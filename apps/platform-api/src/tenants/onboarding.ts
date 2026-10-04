/*
 * Tenant onboarding (租戶開通流程), the platform's four steps: create the tenant, its KMS key and its Identity
 * Platform tenant, then copy the default templates and invite the first tenant admin. Everything runs in the
 * request's transaction; the KMS key and Identity Platform tenant register undo steps, so if any later step fails
 * (including the invitation email) nothing is left behind.
 */
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { plans, tenants, tenantSubscriptions } from '@yutis/db';
import { isAvailableTenantSubdomain } from '@yutis/domain';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PlatformConfig } from '../config.js';
import { recordPlatformAudit } from '../core/audit.js';
import { onRollback, type RequestContext } from '../core/context.js';
import { PLATFORM_CONFIG } from '../core/database.js';
import { pgErrorCode } from '../core/pg.js';
import {
  BILLING, IDENTITY_TENANTS, INVITATIONS, TENANT_KEYS,
  type BillingProvider, type IdentityTenantService, type InvitationMailer, type TenantKeyService,
} from '../integrations/integrations.js';

const isoDate = z.iso.date();

export const OnboardTenant = z.object({
  /** Subdomain: acme → acme.care.yutis.com.tw */
  subdomain: z.string().trim().toLowerCase(),
  name: z.string().trim().min(1).max(100),
  planCode: z.string().min(1),
  subscriptionStatus: z.enum(['trial', 'active']).default('trial'),
  seatLimit: z.number().int().positive().nullable().default(null),
  startsOn: isoDate.optional(),
  endsOn: isoDate.nullable().default(null),
  admin: z.object({ email: z.email().toLowerCase(), name: z.string().trim().min(1).max(100) }).strict(),
}).strict();
export type OnboardTenantInput = z.infer<typeof OnboardTenant>;

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
    @Inject(TENANT_KEYS) private readonly keys: TenantKeyService,
    @Inject(IDENTITY_TENANTS) private readonly identityTenants: IdentityTenantService,
    @Inject(INVITATIONS) private readonly invitations: InvitationMailer,
    @Inject(BILLING) private readonly billing: BillingProvider,
  ) {}

  tenantUrl(slug: string) {
    return `https://${slug}.${this.config.tenantBaseDomain}`;
  }

  async onboard(ctx: RequestContext, input: OnboardTenantInput): Promise<string> {
    const slug = input.subdomain;
    if (!isAvailableTenantSubdomain(slug)) {
      throw new BadRequestException({ code: 'invalid_subdomain', message: 'Subdomain must be one lower-case DNS label and not admin, api, www or demo' });
    }
    const [taken] = await ctx.tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
    if (taken) throw new ConflictException({ code: 'subdomain_taken', message: `Subdomain ${slug} is already in use` });
    const [plan] = await ctx.tx.select().from(plans).where(and(eq(plans.code, input.planCode), eq(plans.active, true)));
    if (!plan) throw new BadRequestException({ code: 'unknown_plan', message: `No active plan ${input.planCode}` });

    // 1–3: external resources first, each with its undo step.
    const kmsKeyName = await this.keys.createKey(slug);
    onRollback(ctx, () => this.keys.destroyKey(kmsKeyName));
    const idpTenantId = await this.identityTenants.createTenant(slug, input.name);
    onRollback(ctx, () => this.identityTenants.deleteTenant(idpTenantId));

    let tenantId: string;
    try {
      [{ id: tenantId }] = await ctx.tx.insert(tenants).values({ slug, name: input.name, kmsKeyName, idpTenantId }).returning({ id: tenants.id }) as [{ id: string }];
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException({ code: 'subdomain_taken', message: `Subdomain ${slug} is already in use` });
      throw error;
    }
    const billingRef = await this.billing.createCustomer({ id: tenantId, slug, name: input.name });
    await ctx.tx.insert(tenantSubscriptions).values({
      tenantId, planId: plan.id, status: input.subscriptionStatus, seatLimit: input.seatLimit,
      startsOn: input.startsOn ?? sql`current_date`, endsOn: input.endsOn, billingRef,
    });
    await this.billing.subscriptionChanged({ tenantId, planCode: plan.code, status: input.subscriptionStatus, seatLimit: input.seatLimit });

    // 4: default templates and the first tenant admin, through the database's onboarding-only functions.
    try {
      await ctx.tx.execute(sql`select apply_default_templates(${tenantId})`);
    } catch (error) {
      if (pgErrorCode(error) === 'P0002') {
        throw new ConflictException({ code: 'templates_missing', message: 'No active default templates; run POST /platform-api/templates/sync first' });
      }
      throw error;
    }
    await ctx.tx.execute(sql`select invite_tenant_admin(${tenantId}, ${input.admin.email}, ${input.admin.name})`);

    await recordPlatformAudit(ctx, {
      action: 'tenant.onboard', tenantId, subjectTable: 'tenants', subjectId: tenantId,
      detail: { subdomain: slug, name: input.name, plan: plan.code, subscriptionStatus: input.subscriptionStatus, seatLimit: input.seatLimit },
    });
    // Last, so a failure here still undoes everything above.
    await this.invitations.sendTenantAdminInvitation({
      email: input.admin.email, name: input.admin.name, tenantName: input.name, tenantUrl: this.tenantUrl(slug), idpTenantId,
    });
    return tenantId;
  }
}
