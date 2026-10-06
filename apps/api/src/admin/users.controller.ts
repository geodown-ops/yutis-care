/*
 * Staff accounts (帳號與權限): tenant admins invite staff with a role and the sites they are responsible for, change
 * them, or deactivate them. Only invited people can sign in (see AuthController); deactivating ends their sessions.
 * Admins can also email someone a one-time sign-in link from this system's own address.
 */
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpException, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { sessions, sites, staffRoleEnum, users, userSiteScopes } from '@yutis/db';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { NOT_SENT, SignInLinks, type NotSent } from '../auth/sign-in-links.js';
import { tenantOrigin, type ApiConfig } from '../config.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, staff, type RequestContext, type StaffRole } from '../core/context.js';
import { API_CONFIG } from '../core/database.js';
import { staffInvitationEmail } from '../core/emails.js';
import { ApiErrorDto } from '../core/errors.js';
import { Notifier } from '../core/mail.js';
import { pgErrorCode } from '../core/pg.js';
import { openApiSchema, parse } from '../core/validation.js';

class StaffAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: staffRoleEnum.enumValues }) role!: StaffRole;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '勞工健康服務人員資格' }) qualification!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty({ description: '已用公司帳號（SSO）登入過；未登入過表示邀請尚未接受' }) signedInBefore!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastSignInAt!: Date | null;
  @ApiProperty({ type: [String], format: 'uuid', description: '負責廠區' }) siteIds!: string[];
}

class InvitedStaffDto extends StaffAccountDto {
  @ApiProperty({ description: '邀請信會寄出（寄信服務已設定）；false 表示只記錄、沒有寄出（本機與示範站），請另外通知對方' }) emailed!: boolean;
}

class SignInLinkResultDto {
  @ApiProperty({ description: '已由本系統寄出登入連結；false 表示本系統無法寄，前端可改用登入服務自己寄' }) sent!: boolean;
  @ApiProperty({
    enum: NOT_SENT, required: false,
    description: '沒寄的原因：寄信服務未設定（email_not_configured）、租戶沒有可產生連結的 Email 登入（no_email_link）、登入服務拒絕產生連結，例如權限未設定（link_refused）',
  })
  reason?: NotSent;
}

const InviteStaff = z.object({
  email: z.email().toLowerCase(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(staffRoleEnum.enumValues),
  siteIds: z.array(z.uuid()).max(500).default([]),
  phone: z.string().trim().max(40).nullable().default(null),
  qualification: z.string().trim().max(200).nullable().default(null),
}).strict();
const UpdateStaff = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.enum(staffRoleEnum.enumValues),
  siteIds: z.array(z.uuid()).max(500),
  phone: z.string().trim().max(40).nullable(),
  qualification: z.string().trim().max(200).nullable(),
  active: z.boolean(),
}).partial().strict();

@ApiTags('admin')
@Controller('admin/users')
export class UsersController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig, private readonly notifier: Notifier, private readonly links: SignInLinks) {}

  @Get()
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({ summary: '後台人員帳號' })
  @ApiOkResponse({ type: [StaffAccountDto] })
  async list(@Ctx() ctx: RequestContext): Promise<StaffAccountDto[]> {
    const rows = await ctx.tx.select().from(users).orderBy(asc(users.name));
    const scopes = await ctx.tx.select().from(userSiteScopes);
    return rows.map(u => toDto(u, scopes.filter(s => s.userId === u.id).map(s => s.siteId)));
  }

  @Post()
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({
    summary: '邀請後台人員',
    description: '指定角色與負責廠區，並寄邀請信（含登入網址）給對方；對方以公司帳號（SSO）或本地帳號第一次登入時綁定。只有被邀請的人能登入。',
  })
  @ApiBody({ schema: openApiSchema(InviteStaff) })
  @ApiCreatedResponse({ type: InvitedStaffDto })
  @ApiConflictResponse({ description: '此 Email 已有帳號（account_exists）', type: ApiErrorDto })
  async invite(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<InvitedStaffDto> {
    const input = parse(InviteStaff, body);
    await assertSites(ctx, input.siteIds);
    const [existing] = await ctx.tx.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, input.email));
    if (existing) throw new ConflictException({ code: 'account_exists', message: `${input.email} already has an account` });
    let created: typeof users.$inferSelect;
    try {
      [created] = await ctx.tx.insert(users).values({
        tenantId: ctx.tenant.id, email: input.email, name: input.name, role: input.role, phone: input.phone, qualification: input.qualification,
        createdBy: staff(ctx).userId,
      }).returning() as [typeof users.$inferSelect];
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException({ code: 'account_exists', message: `${input.email} already has an account` });
      throw error;
    }
    if (input.siteIds.length) await ctx.tx.insert(userSiteScopes).values(input.siteIds.map(siteId => ({ tenantId: ctx.tenant.id, userId: created.id, siteId })));
    await recordAudit(ctx, { action: 'create', subjectTable: 'users', subjectId: created.id, dataCategory: 'identity', reason: `invite ${input.role}` });
    await this.notifier.email(ctx, staffInvitationEmail({
      to: input.email, userId: created.id, name: input.name, tenantName: ctx.tenant.name, url: `${tenantOrigin(this.config, ctx.tenant.slug)}/`,
    }));
    return { ...toDto(created, input.siteIds), emailed: this.notifier.delivers };
  }

  @Patch(':id')
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({ summary: '修改後台人員：角色、負責廠區、停用', description: '停用會立即登出該人員。不能停用自己或改自己的角色，也不能讓租戶沒有啟用中的租戶管理員。' })
  @ApiBody({ schema: openApiSchema(UpdateStaff) })
  @ApiOkResponse({ type: StaffAccountDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<StaffAccountDto> {
    const input = parse(UpdateStaff, body);
    const me = staff(ctx);
    const [current] = await ctx.tx.select().from(users).where(eq(users.id, id));
    if (!current) throw new NotFoundException({ code: 'account_not_found', message: 'No such account' });
    if (id === me.userId && (input.active === false || (input.role && input.role !== current.role))) {
      throw new BadRequestException({ code: 'cannot_change_self', message: 'You cannot deactivate yourself or change your own role' });
    }
    const losesAdmin = current.role === '租戶管理員' && current.active && (input.active === false || (input.role && input.role !== '租戶管理員'));
    if (losesAdmin) {
      const [{ others }] = await ctx.tx.select({ others: sql<number>`count(*)::int` }).from(users)
        .where(and(eq(users.role, '租戶管理員'), eq(users.active, true), ne(users.id, id))) as [{ others: number }];
      if (others === 0) throw new ConflictException({ code: 'last_tenant_admin', message: 'The tenant must keep at least one active tenant admin' });
    }
    if (input.siteIds) await assertSites(ctx, input.siteIds);

    const { siteIds, ...fields } = input;
    const [updated] = await ctx.tx.update(users).set({ ...fields, updatedAt: new Date(), updatedBy: me.userId }).where(eq(users.id, id)).returning() as [typeof users.$inferSelect];
    if (siteIds) {
      await ctx.tx.delete(userSiteScopes).where(eq(userSiteScopes.userId, id));
      if (siteIds.length) await ctx.tx.insert(userSiteScopes).values(siteIds.map(siteId => ({ tenantId: ctx.tenant.id, userId: id, siteId })));
    }
    if (input.active === false) {
      await ctx.tx.update(sessions).set({ revokedAt: sql`now()` }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
    }
    await recordAudit(ctx, { action: 'update', subjectTable: 'users', subjectId: id, dataCategory: 'identity', reason: `changed ${Object.keys(input).join(', ')}` });
    const scopes = await ctx.tx.select({ siteId: userSiteScopes.siteId }).from(userSiteScopes).where(eq(userSiteScopes.userId, id));
    return toDto(updated, scopes.map(s => s.siteId));
  }

  @Post(':id/sign-in-link')
  @HttpCode(200)
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({
    summary: '寄登入連結給後台人員',
    description: '以本系統的寄件地址寄一次性 Email 登入連結（連結由登入服務產生）。寄信服務未設定、租戶沒有開啟 Email 登入或無法產生連結時回 sent=false，不寄信。同一人一分鐘內只能寄一次，一天最多十次。',
  })
  @ApiOkResponse({ type: SignInLinkResultDto })
  @ApiConflictResponse({ description: '帳號已停用（account_inactive）', type: ApiErrorDto })
  async sendSignInLink(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<SignInLinkResultDto> {
    const [account] = await ctx.tx.select().from(users).where(eq(users.id, id));
    if (!account) throw new NotFoundException({ code: 'account_not_found', message: 'No such account' });
    if (!account.active) throw new ConflictException({ code: 'account_inactive', message: 'The account is deactivated' });
    const result = await this.links.send(ctx, { kind: 'staff', id, email: account.email, name: account.name });
    if (!result.sent && result.reason === 'too_many') throw new HttpException({ code: 'too_many_requests', message: 'A sign-in link was sent a moment ago' }, 429);
    return result;
  }
}

async function assertSites(ctx: RequestContext, siteIds: string[]) {
  if (!siteIds.length) return;
  const found = await ctx.tx.select({ id: sites.id }).from(sites).where(inArray(sites.id, siteIds));
  if (found.length !== new Set(siteIds).size) throw new BadRequestException({ code: 'unknown_site', message: 'One or more sites do not exist' });
}

function toDto(u: typeof users.$inferSelect, siteIds: string[]): StaffAccountDto {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, qualification: u.qualification, active: u.active,
    signedInBefore: u.idpSubject !== null, lastSignInAt: u.lastSignInAt, siteIds,
  };
}
