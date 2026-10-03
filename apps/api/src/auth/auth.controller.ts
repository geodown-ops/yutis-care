import { Body, Controller, HttpCode, Inject, Logger, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiNoContentResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { employees, users } from '@yutis/db';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { recordAudit } from '../core/audit.js';
import { ApiErrorDto } from '../core/errors.js';
import { Ctx, signedIn, type EmployeePrincipal, type Principal, type RequestContext, type StaffPrincipal } from '../core/context.js';
import { openApiSchema, parse } from '../core/validation.js';
import { Public, SignedIn } from './access.js';
import { IDENTITY_VERIFIER, type IdentityVerifier, type VerifiedIdentity } from './identity.js';
import { SessionService } from './sessions.js';

/** The account a sign-in matched, before it has a session. */
type Account = Omit<StaffPrincipal, 'sessionId'> | Omit<EmployeePrincipal, 'sessionId'>;

const SignIn = z.object({
  /** The ID token from the tenant's sign-in provider. */
  token: z.string().min(1).max(8192),
  /** Back office (`staff`) or employee portal (`employee`). */
  as: z.enum(['staff', 'employee']),
}).strict();

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
  ) {}

  @Post('sign-in')
  @HttpCode(204)
  @Public()
  @ApiOperation({
    summary: '登入：以登入服務的 ID token 換取 session cookie',
    description: '後台人員須已被租戶管理員邀請；第一次登入時綁定登入服務的帳號。員工以 Email 或手機對應員工主檔。',
  })
  @ApiBody({ schema: openApiSchema(SignIn) })
  @ApiNoContentResponse({ description: '已登入，回應帶 Set-Cookie' })
  @ApiBadRequestResponse({ description: '格式錯誤（validation_failed）', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'token 無效，或沒有對應的帳號', type: ApiErrorDto })
  @ApiServiceUnavailableResponse({ description: '登入服務尚未設定（sign_in_unavailable）', type: ApiErrorDto })
  async signIn(@Ctx() ctx: RequestContext, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    const req = parse(SignIn, body);
    const identity = await this.identity.verify(req.token, ctx.tenant);
    if (!identity) throw new UnauthorizedException();
    const account = req.as === 'staff' ? await this.findStaff(ctx, identity) : await this.findEmployee(ctx, identity);
    if (!account) {
      this.logger.warn(`Sign-in as ${req.as} on ${ctx.tenant.slug} matched no account (${identity.issuer})`);
      throw new UnauthorizedException();
    }
    const sessionId = await this.sessions.start(ctx, reply, account.kind === 'staff' ? { userId: account.userId } : { employeeId: account.employeeId });
    const principal: Principal = { ...account, sessionId };
    await recordAudit(ctx, { action: 'sign_in', reason: identity.issuer === 'dev' ? 'dev sign-in' : undefined }, principal);
  }

  @Post('sign-out')
  @HttpCode(204)
  @SignedIn()
  @ApiOperation({ summary: '登出' })
  @ApiNoContentResponse()
  async signOut(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.sessions.end(ctx, signedIn(ctx).sessionId, reply);
  }

  /** Staff must have been invited: matched by their provider account, or on first sign-in by their invited email. */
  private async findStaff(ctx: RequestContext, id: VerifiedIdentity): Promise<Account | undefined> {
    let [user] = await ctx.tx.select().from(users).where(and(eq(users.idpIssuer, id.issuer), eq(users.idpSubject, id.subject)));
    if (!user && id.email) {
      [user] = await ctx.tx.update(users).set({ idpIssuer: id.issuer, idpSubject: id.subject })
        .where(and(eq(sql`lower(${users.email})`, id.email.toLowerCase()), isNull(users.idpSubject)))
        .returning();
    }
    if (!user?.active) return undefined;
    await ctx.tx.update(users).set({ lastSignInAt: sql`now()` }).where(eq(users.id, user.id));
    return { kind: 'staff', userId: user.id, name: user.name, email: user.email, role: user.role };
  }

  /** Employees are matched by verified email or phone in the employee master; it must be exactly one current employee. */
  private async findEmployee(ctx: RequestContext, id: VerifiedIdentity): Promise<Account | undefined> {
    const match = id.email ? eq(sql`lower(${employees.email})`, id.email.toLowerCase()) : id.phone ? eq(employees.phone, id.phone) : undefined;
    if (!match) return undefined;
    const found = await ctx.tx.select().from(employees).where(and(match, ne(employees.status, '離職'))).limit(2);
    const e = found.length === 1 ? found[0] : undefined;
    return e && { kind: 'employee', employeeId: e.id, name: e.name, lang: e.lang };
  }
}
