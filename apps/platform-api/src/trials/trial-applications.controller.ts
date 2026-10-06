/*
 * Online trial applications (線上申請試用). The marketing site's form posts here without signing in; the load balancer
 * exposes only /platform-api/public/* on the site's host. An application is only stored and announced by email:
 * nothing is created for the company until platform staff approve it, which onboards the tenant (onboarding.ts) and
 * so sends the first administrator their sign-in link.
 */
import {
  BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpException, Inject, Logger, NotFoundException, Param,
  ParseUUIDPipe, Post, Query, Req,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { platformAuditLog, trialApplications, trialApplicationStatusEnum, type Db } from '@yutis/db';
import { isFreeMailAddress, isPlausiblePhone, isValidTaxId, TRIAL_EMPLOYEE_RANGES, TRIAL_IDENTITY_PROVIDERS } from '@yutis/domain';
import { and, count, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Public, Requires } from '../auth/access.js';
import type { PlatformConfig } from '../config.js';
import { recordPlatformAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { DB, PLATFORM_CONFIG } from '../core/database.js';
import { ApiErrorDto } from '../core/errors.js';
import { MAILER, maskEmail, type Mailer } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { OnboardingService, OnboardTenant } from '../tenants/onboarding.js';
import { applicationReceived, applicationToReview } from './emails.js';

type TrialApplicationStatus = (typeof trialApplicationStatusEnum.enumValues)[number];

export const TrialApplicationRequest = z.object({
  companyName: z.string().trim().min(1).max(100),
  taxId: z.string().trim(),
  employeeRange: z.enum(TRIAL_EMPLOYEE_RANGES),
  contactName: z.string().trim().min(1).max(50),
  contactTitle: z.string().trim().min(1).max(50),
  email: z.email().trim().toLowerCase().max(254),
  phone: z.string().trim().max(30).refine(isPlausiblePhone, { message: 'Not a phone number' }),
  preferredSubdomain: z.string().trim().toLowerCase().max(63).regex(/^[a-z0-9-]*$/).nullish().transform(v => v || null),
  identityProvider: z.enum(TRIAL_IDENTITY_PROVIDERS).nullish().transform(v => v ?? null),
  consent: z.literal(true),
  /** Honeypot: a field people never see. Anything in it means a bot. */
  website: z.string().max(200).optional(),
  /** Milliseconds between showing the form and sending it. */
  elapsedMs: z.number().nonnegative().optional(),
}).strict();

const Decline = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

/** Faster than any person fills the form in. */
const MIN_FILL_MS = 3_000;
/** Applications one client address may send per day. */
const DAILY_LIMIT_PER_ADDRESS = 5;
/** Applications that never became a tenant are kept this long (隱私權政策). */
const KEEP_UNAPPROVED_DAYS = 365;

class TrialApplicationReceivedDto {
  @ApiProperty({ enum: ['received'] }) status!: 'received';
}

export class TrialApplicationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: trialApplicationStatusEnum.enumValues, description: '待審核、已開通、已婉拒' }) status!: TrialApplicationStatus;
  @ApiProperty() companyName!: string;
  @ApiProperty({ description: '統一編號' }) taxId!: string;
  @ApiProperty({ enum: TRIAL_EMPLOYEE_RANGES }) employeeRange!: string;
  @ApiProperty() contactName!: string;
  @ApiProperty() contactTitle!: string;
  @ApiProperty() email!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ type: String, nullable: true }) preferredSubdomain!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: TRIAL_IDENTITY_PROVIDERS }) identityProvider!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decidedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: '審核人 Email' }) decidedBy!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '婉拒原因（內部紀錄，不寄給申請人）' }) declineReason!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: '開通後的租戶' }) tenantId!: string | null;
}

const notFound = () => new NotFoundException({ code: 'trial_application_not_found', message: 'No such trial application' });

/** The client address is only kept hashed; it is used to limit how often one address may apply. */
export const hashAddress = (ip: string) => createHash('sha256').update(`yutis-trial-application:${ip}`).digest('hex');

@ApiTags('trial-applications')
@Controller()
export class TrialApplicationsController {
  private readonly logger = new Logger(TrialApplicationsController.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
  ) {}

  @Post('public/trial-applications')
  @HttpCode(202)
  @Public()
  @ApiOperation({
    summary: '線上申請試用（官網，不需登入）',
    description: '只儲存申請並通知營運與申請人；不會自動開通。公司 Email 不能是免費信箱（free_mail），統一編號須通過檢查碼（invalid_tax_id）。同一個來源每天最多 5 件。',
  })
  @ApiBody({ schema: openApiSchema(TrialApplicationRequest) })
  @ApiAcceptedResponse({ type: TrialApplicationReceivedDto })
  @ApiBadRequestResponse({ description: 'validation_failed、free_mail、invalid_tax_id', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async submit(@Req() request: FastifyRequest, @Body() body: unknown): Promise<TrialApplicationReceivedDto> {
    const input = parse(TrialApplicationRequest, body);
    const received = { status: 'received' } as const;
    // Bots get the same answer as people, so they learn nothing; their submissions are dropped.
    if (input.website || (input.elapsedMs !== undefined && input.elapsedMs < MIN_FILL_MS)) return received;
    if (!isValidTaxId(input.taxId)) throw new BadRequestException({ code: 'invalid_tax_id', message: 'The 統一編號 check digit does not match' });
    if (isFreeMailAddress(input.email)) throw new BadRequestException({ code: 'free_mail', message: 'Use a company mailbox, not a free one' });

    const ipHash = hashAddress(request.ip);
    const since = new Date(Date.now() - 86_400_000);
    const application = await this.db.transaction(async tx => {
      const [recent] = await tx.select({ n: count() }).from(trialApplications)
        .where(and(eq(trialApplications.ipHash, ipHash), gte(trialApplications.createdAt, since)));
      if ((recent?.n ?? 0) >= DAILY_LIMIT_PER_ADDRESS) throw new HttpException({ code: 'too_many_requests', message: 'Too many applications from this address today' }, 429);
      // Sending the same application twice (a double click, a retry) neither stores nor emails it again.
      const [pending] = await tx.select({ id: trialApplications.id }).from(trialApplications)
        .where(and(eq(trialApplications.email, input.email), eq(trialApplications.status, 'pending'), gte(trialApplications.createdAt, since)));
      if (pending) return null;
      await tx.delete(trialApplications).where(and(
        ne(trialApplications.status, 'approved'), lt(trialApplications.createdAt, sql`now() - make_interval(days => ${KEEP_UNAPPROVED_DAYS})`)));
      const [row] = await tx.insert(trialApplications).values({
        companyName: input.companyName, taxId: input.taxId, employeeRange: input.employeeRange, contactName: input.contactName,
        contactTitle: input.contactTitle, email: input.email, phone: input.phone, preferredSubdomain: input.preferredSubdomain,
        identityProvider: input.identityProvider, consentedAt: new Date(), ipHash,
      }).returning();
      await tx.insert(platformAuditLog).values({
        actorEmail: input.email, action: 'trial_application.submit', subjectTable: 'trial_applications', subjectId: row!.id,
        detail: { companyName: input.companyName, employeeRange: input.employeeRange }, ip: request.ip, userAgent: request.headers['user-agent'],
      });
      return row!;
    });
    if (!application) return received;

    // After the commit, so nobody hears about an application that was not stored. A failed email does not fail the
    // application: it is in the platform admin either way.
    const base = this.config.tenantBaseDomain;
    const mails = [applicationReceived(application, base), ...this.config.trialNotifyEmails.map(to => applicationToReview(application, to, base))];
    for (const mail of mails) {
      try {
        await this.mailer.send(mail);
      } catch (error) {
        this.logger.warn(`Trial application ${application.id}: email to ${maskEmail(mail.to)} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return received;
  }

  @Get('trial-applications')
  @Requires('tenants:read')
  @ApiOperation({ summary: '試用申請列表', description: '新的在前。status 不給時列出全部。' })
  @ApiQuery({ name: 'status', required: false, enum: trialApplicationStatusEnum.enumValues })
  @ApiOkResponse({ type: [TrialApplicationDto] })
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string): Promise<TrialApplicationDto[]> {
    const filter = status === undefined ? undefined : parse(z.enum(trialApplicationStatusEnum.enumValues), status);
    const rows = await this.select(ctx, filter ? eq(trialApplications.status, filter) : undefined);
    return rows;
  }

  @Post('trial-applications/:id/approve')
  @HttpCode(200)
  @Requires('tenants:write')
  @ApiOperation({
    summary: '開通試用申請',
    description: '用審核後的資料開通租戶（同 POST /tenants：建立租戶、金鑰、登入租戶與訂閱，邀請第一位租戶管理員），並把申請標為已開通。',
  })
  @ApiBody({ schema: openApiSchema(OnboardTenant) })
  @ApiOkResponse({ type: TrialApplicationDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '申請已處理過（trial_application_decided），或子網域已被使用（subdomain_taken）', type: ApiErrorDto })
  async approve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<TrialApplicationDto> {
    const input = parse(OnboardTenant, body);
    await this.pending(ctx, id);
    const tenantId = await this.onboarding.onboard(ctx, input);
    await ctx.tx.update(trialApplications).set({ status: 'approved', tenantId, decidedAt: new Date(), decidedBy: ctx.user.id }).where(eq(trialApplications.id, id));
    await recordPlatformAudit(ctx, { action: 'trial_application.approve', tenantId, subjectTable: 'trial_applications', subjectId: id, detail: { subdomain: input.subdomain } });
    return this.one(ctx, id);
  }

  @Post('trial-applications/:id/decline')
  @HttpCode(200)
  @Requires('tenants:write')
  @ApiOperation({ summary: '婉拒試用申請', description: '原因只留在平台內部，不會寄給申請人。' })
  @ApiBody({ schema: openApiSchema(Decline) })
  @ApiOkResponse({ type: TrialApplicationDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '申請已處理過（trial_application_decided）', type: ApiErrorDto })
  async decline(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<TrialApplicationDto> {
    const { reason } = parse(Decline, body);
    await this.pending(ctx, id);
    await ctx.tx.update(trialApplications).set({ status: 'declined', declineReason: reason, decidedAt: new Date(), decidedBy: ctx.user.id })
      .where(eq(trialApplications.id, id));
    await recordPlatformAudit(ctx, { action: 'trial_application.decline', subjectTable: 'trial_applications', subjectId: id, detail: { reason } });
    return this.one(ctx, id);
  }

  /** Lock a pending application for the decision; anything else is refused. */
  private async pending(ctx: RequestContext, id: string) {
    const [row] = await ctx.tx.select({ status: trialApplications.status }).from(trialApplications).where(eq(trialApplications.id, id)).for('update');
    if (!row) throw notFound();
    if (row.status !== 'pending') throw new ConflictException({ code: 'trial_application_decided', message: `The application is already ${row.status}` });
  }

  private async one(ctx: RequestContext, id: string): Promise<TrialApplicationDto> {
    const [row] = await this.select(ctx, eq(trialApplications.id, id));
    if (!row) throw notFound();
    return row;
  }

  private async select(ctx: RequestContext, where: ReturnType<typeof eq> | undefined): Promise<TrialApplicationDto[]> {
    const rows = await ctx.tx.select({
      application: trialApplications,
      decidedBy: sql<string | null>`(select email from platform_users p where p.id = ${trialApplications.decidedBy})`,
    }).from(trialApplications).where(where).orderBy(desc(trialApplications.createdAt));
    return rows.map(({ application: a, decidedBy }) => ({
      id: a.id, status: a.status, companyName: a.companyName, taxId: a.taxId, employeeRange: a.employeeRange, contactName: a.contactName,
      contactTitle: a.contactTitle, email: a.email, phone: a.phone, preferredSubdomain: a.preferredSubdomain, identityProvider: a.identityProvider,
      createdAt: a.createdAt, decidedAt: a.decidedAt, decidedBy, declineReason: a.declineReason, tenantId: a.tenantId,
    }));
  }
}
