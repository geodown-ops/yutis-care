import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { currentSubscriptionFirst, plans, subscriptionStatusEnum, tenants, tenantSubscriptions, type Tx } from '@yutis/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Requires } from '../auth/access.js';
import { recordPlatformAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { ApiErrorDto } from '../core/errors.js';
import { openApiSchema, parse } from '../core/validation.js';
import { BILLING, type BillingProvider } from '../integrations/integrations.js';
import { OnboardingService, OnboardTenant } from './onboarding.js';

type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];

export class SubscriptionDto {
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty({ enum: subscriptionStatusEnum.enumValues, description: '試用、啟用、逾期、解約' }) status!: SubscriptionStatus;
  @ApiProperty({ type: Number, nullable: true, description: '人數上限；超過只提醒、不阻擋' }) seatLimit!: number | null;
  @ApiProperty({ format: 'date' }) startsOn!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) endsOn!: string | null;
}

export class TenantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'acme' }) subdomain!: string;
  @ApiProperty({ example: 'https://acme.care.yutis.com.tw' }) url!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['active', 'suspended', 'closed'] }) status!: 'active' | 'suspended' | 'closed';
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: SubscriptionDto, nullable: true, description: '目前的訂閱：已開始的最新一期（都還沒開始時為最早的一期）' }) subscription!: SubscriptionDto | null;
  @ApiProperty({ description: '在職員工數（資料庫函式計算，平台看不到明細）' }) activeEmployees!: number;
  @ApiProperty({ description: '啟用中的後台帳號數' }) staffAccounts!: number;
  @ApiProperty({ description: '在職員工數超過人數上限' }) overSeatLimit!: boolean;
}

export class TenantAdminDto {
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastSignInAt!: Date | null;
}

export class TenantDetailDto extends TenantDto {
  @ApiProperty({ description: '已建立租戶金鑰（Cloud KMS）' }) encryptionKeyReady!: boolean;
  @ApiProperty({ description: '已建立登入租戶（Identity Platform）' }) signInTenantReady!: boolean;
  @ApiProperty({ type: [SubscriptionDto], description: '訂閱歷史，新的在前' }) subscriptions!: SubscriptionDto[];
  @ApiProperty({ type: [TenantAdminDto], description: '租戶管理員名單（由資料庫函式提供，平台讀不到帳號表）' }) admins!: TenantAdminDto[];
}

const Suspend = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

const SetSubscription = z.object({
  planCode: z.string().min(1),
  status: z.enum(subscriptionStatusEnum.enumValues),
  seatLimit: z.number().int().positive().nullable(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable(),
}).strict().refine(s => !s.endsOn || s.endsOn >= s.startsOn, { message: 'endsOn must not be before startsOn', path: ['endsOn'] });

const NewPeriod = z.object({
  planCode: z.string().min(1),
  status: z.enum(subscriptionStatusEnum.enumValues).default('active'),
  seatLimit: z.number().int().positive().nullable(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable().default(null),
}).strict().refine(s => !s.endsOn || s.endsOn >= s.startsOn, { message: 'endsOn must not be before startsOn', path: ['endsOn'] });

const dayBefore = (isoDate: string) => new Date(Date.parse(isoDate) - 86_400_000).toISOString().slice(0, 10);

const notFound = () => new NotFoundException({ code: 'tenant_not_found', message: 'No such tenant' });

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
    @Inject(BILLING) private readonly billing: BillingProvider,
  ) {}

  @Get()
  @Requires('tenants:read')
  @ApiOperation({ summary: '租戶列表' })
  @ApiOkResponse({ type: [TenantDto] })
  async list(@Ctx() ctx: RequestContext): Promise<TenantDto[]> {
    const rows = await ctx.tx.select().from(tenants).orderBy(asc(tenants.name));
    return Promise.all(rows.map(async t => (await this.describe(ctx.tx, t)).summary));
  }

  @Get(':id')
  @Requires('tenants:read')
  @ApiOperation({ summary: '租戶詳情' })
  @ApiOkResponse({ type: TenantDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<TenantDetailDto> {
    return this.load(ctx, id);
  }

  @Post()
  @Requires('tenants:write')
  @ApiOperation({
    summary: '開通租戶',
    description: '建立租戶、租戶金鑰（Cloud KMS）、登入租戶（Identity Platform）與訂閱，複製預設範本，邀請第一位租戶管理員。任一步失敗會清除已建立的部分。',
  })
  @ApiBody({ schema: openApiSchema(OnboardTenant) })
  @ApiCreatedResponse({ type: TenantDetailDto })
  @ApiConflictResponse({ description: '子網域已被使用（subdomain_taken），或尚未建立預設範本（templates_missing）', type: ApiErrorDto })
  async onboard(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<TenantDetailDto> {
    const id = await this.onboarding.onboard(ctx, parse(OnboardTenant, body));
    return this.load(ctx, id);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Requires('tenants:write')
  @ApiOperation({ summary: '停用租戶', description: '停用後該租戶的後台與員工端立即無法使用，資料保留。' })
  @ApiBody({ schema: openApiSchema(Suspend) })
  @ApiOkResponse({ type: TenantDetailDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  async suspend(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<TenantDetailDto> {
    const { reason } = parse(Suspend, body);
    await this.changeStatus(ctx, id, 'active', 'suspended');
    await recordPlatformAudit(ctx, { action: 'tenant.suspend', tenantId: id, subjectTable: 'tenants', subjectId: id, detail: { reason } });
    return this.load(ctx, id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Requires('tenants:write')
  @ApiOperation({ summary: '恢復停用的租戶' })
  @ApiOkResponse({ type: TenantDetailDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  async reactivate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<TenantDetailDto> {
    await this.changeStatus(ctx, id, 'suspended', 'active');
    await recordPlatformAudit(ctx, { action: 'tenant.reactivate', tenantId: id, subjectTable: 'tenants', subjectId: id });
    return this.load(ctx, id);
  }

  @Put(':id/subscription')
  @Requires('subscriptions:write')
  @ApiOperation({
    summary: '修改目前的訂閱',
    description: '直接改目前這一期（方案、狀態、人數上限、起訖日），用來更正；沒有訂閱時新增一筆。續約或換方案請用 POST /tenants/{id}/subscriptions，訂閱歷史才會保留。目前不依此收費。',
  })
  @ApiBody({ schema: openApiSchema(SetSubscription) })
  @ApiOkResponse({ type: TenantDetailDto })
  async setSubscription(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<TenantDetailDto> {
    const input = parse(SetSubscription, body);
    const [tenant] = await ctx.tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id));
    if (!tenant) throw notFound();
    const [plan] = await ctx.tx.select().from(plans).where(and(eq(plans.code, input.planCode), eq(plans.active, true)));
    if (!plan) throw new BadRequestException({ code: 'unknown_plan', message: `No active plan ${input.planCode}` });
    const values = { planId: plan.id, status: input.status, seatLimit: input.seatLimit, startsOn: input.startsOn, endsOn: input.endsOn, updatedAt: new Date() };
    const [current] = await ctx.tx.select({ id: tenantSubscriptions.id }).from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, id)).orderBy(...currentSubscriptionFirst()).limit(1);
    if (current) await ctx.tx.update(tenantSubscriptions).set(values).where(eq(tenantSubscriptions.id, current.id));
    else await ctx.tx.insert(tenantSubscriptions).values({ tenantId: id, ...values });
    await this.billing.subscriptionChanged({ tenantId: id, planCode: plan.code, status: input.status, seatLimit: input.seatLimit });
    await recordPlatformAudit(ctx, { action: 'subscription.set', tenantId: id, subjectTable: 'tenant_subscriptions', detail: { ...input } });
    return this.load(ctx, id);
  }

  @Post(':id/subscriptions')
  @Requires('subscriptions:write')
  @ApiOperation({
    summary: '新增訂閱期間（續約、換方案）',
    description: '新增一期，舊的留在訂閱歷史；開始日一到就成為目前的訂閱，所以可以在這期結束前先續約。新的一期要晚於最近一期的開始日；最近一期沒有結束日、或結束日不早於新期間開始日時，結束日改為新期間開始的前一天。目前不依此收費。',
  })
  @ApiBody({ schema: openApiSchema(NewPeriod) })
  @ApiCreatedResponse({ type: TenantDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '新期間沒有晚於最近一期的開始日（period_overlap）', type: ApiErrorDto })
  async addPeriod(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<TenantDetailDto> {
    const input = parse(NewPeriod, body);
    const [tenant] = await ctx.tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id));
    if (!tenant) throw notFound();
    const [plan] = await ctx.tx.select().from(plans).where(and(eq(plans.code, input.planCode), eq(plans.active, true)));
    if (!plan) throw new BadRequestException({ code: 'unknown_plan', message: `No active plan ${input.planCode}` });
    const [latest] = await ctx.tx.select().from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, id)).orderBy(desc(tenantSubscriptions.startsOn), desc(tenantSubscriptions.createdAt)).limit(1);
    let previousEndsOn: string | undefined;
    if (latest) {
      if (input.startsOn <= latest.startsOn) {
        throw new ConflictException({ code: 'period_overlap', message: `A new period must start after the latest one (${latest.startsOn})` });
      }
      if (latest.endsOn === null || latest.endsOn >= input.startsOn) {
        previousEndsOn = dayBefore(input.startsOn);
        await ctx.tx.update(tenantSubscriptions).set({ endsOn: previousEndsOn, updatedAt: new Date() }).where(eq(tenantSubscriptions.id, latest.id));
      }
    }
    await ctx.tx.insert(tenantSubscriptions).values({
      tenantId: id, planId: plan.id, status: input.status, seatLimit: input.seatLimit, startsOn: input.startsOn, endsOn: input.endsOn, billingRef: latest?.billingRef ?? null,
    });
    await this.billing.subscriptionChanged({ tenantId: id, planCode: plan.code, status: input.status, seatLimit: input.seatLimit });
    await recordPlatformAudit(ctx, {
      action: 'subscription.renew', tenantId: id, subjectTable: 'tenant_subscriptions', detail: { ...input, ...(previousEndsOn ? { previousEndsOn } : {}) },
    });
    return this.load(ctx, id);
  }

  private async changeStatus(ctx: RequestContext, id: string, from: 'active' | 'suspended', to: 'active' | 'suspended') {
    const [changed] = await ctx.tx.update(tenants).set({ status: to }).where(and(eq(tenants.id, id), eq(tenants.status, from))).returning({ id: tenants.id });
    if (changed) return;
    const [tenant] = await ctx.tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, id));
    if (!tenant) throw notFound();
    throw new ConflictException({ code: 'tenant_status', message: `Tenant is ${tenant.status}, not ${from}` });
  }

  private async load(ctx: RequestContext, id: string): Promise<TenantDetailDto> {
    const [tenant] = await ctx.tx.select().from(tenants).where(eq(tenants.id, id));
    if (!tenant) throw notFound();
    const { summary, subscriptions } = await this.describe(ctx.tx, tenant);
    const { rows: admins } = await ctx.tx.execute<{ name: string; email: string; active: boolean; last_sign_in_at: Date | null }>(
      sql`select name, email, active, last_sign_in_at from tenant_admins(${id})`);
    return {
      ...summary, encryptionKeyReady: !!tenant.kmsKeyName, signInTenantReady: !!tenant.idpTenantId, subscriptions,
      admins: admins.map(a => ({ name: a.name, email: a.email, active: a.active, lastSignInAt: a.last_sign_in_at })),
    };
  }

  private async describe(tx: Tx, t: typeof tenants.$inferSelect): Promise<{ summary: TenantDto; subscriptions: SubscriptionDto[] }> {
    const subscriptions = await tx.select({
      planCode: plans.code, planName: plans.name, status: tenantSubscriptions.status, seatLimit: tenantSubscriptions.seatLimit,
      startsOn: tenantSubscriptions.startsOn, endsOn: tenantSubscriptions.endsOn,
    }).from(tenantSubscriptions).innerJoin(plans, eq(plans.id, tenantSubscriptions.planId))
      .where(eq(tenantSubscriptions.tenantId, t.id)).orderBy(desc(tenantSubscriptions.startsOn), desc(tenantSubscriptions.createdAt));
    const { rows } = await tx.execute<{ active_employees: string; staff_accounts: string }>(
      sql`select active_employees, staff_accounts from tenant_counts(current_date) where tenant_id = ${t.id}`);
    const activeEmployees = Number(rows[0]?.active_employees ?? 0);
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    const subscription = subscriptions.find(sub => sub.startsOn <= today) ?? subscriptions.at(-1) ?? null;
    return {
      subscriptions,
      summary: {
        id: t.id, subdomain: t.slug, url: this.onboarding.tenantUrl(t.slug), name: t.name, status: t.status, createdAt: t.createdAt,
        subscription, activeEmployees, staffAccounts: Number(rows[0]?.staff_accounts ?? 0),
        overSeatLimit: subscription?.seatLimit != null && activeEmployees > subscription.seatLimit,
      },
    };
  }
}
