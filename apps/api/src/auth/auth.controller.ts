import { Body, Controller, HttpCode, Inject, Logger, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
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
import { SignInLinks, type SignInLinkRecipient } from './sign-in-links.js';

/** The account a sign-in matched, before it has a session. */
type Account = Omit<StaffPrincipal, 'sessionId'> | Omit<EmployeePrincipal, 'sessionId'>;

const SignIn = z.object({
  /** The ID token from the tenant's sign-in provider. */
  token: z.string().min(1).max(8192),
  /** Back office (`staff`) or employee portal (`employee`). */
  as: z.enum(['staff', 'employee']),
}).strict();

const EmailLink = z.object({
  email: z.email().toLowerCase(),
  as: z.enum(['staff', 'employee']),
}).strict();

class EmailLinkResultDto {
  @ApiProperty({
    description: 'true：系統已處理（有這個帳號就寄出；沒有帳號也回 true，不透露帳號是否存在）。false：系統無法寄，登入頁改由登入服務自己寄。',
  })
  sent!: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
    private readonly links: SignInLinks,
  ) {}

  @Post('email-link')
  @HttpCode(200)
  @Public()
  @ApiOperation({
    summary: '登入頁：寄一次性 Email 登入連結',
    description: '以本系統的寄件地址寄登入連結給這個租戶的後台人員（as=staff）或在職員工（as=employee）。不存在的帳號不寄信但一樣回 sent=true；'
      + '同一人一分鐘一封、一天十封。寄信服務未設定或無法產生連結時回 sent=false。',
  })
  @ApiBody({ schema: openApiSchema(EmailLink) })
  @ApiOkResponse({ type: EmailLinkResultDto })
  async emailLink(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<EmailLinkResultDto> {
    const req = parse(EmailLink, body);
    if (!this.links.delivers) return { sent: false };
    const recipient = req.as === 'staff' ? await this.staffByEmail(ctx, req.email) : await this.employeeByEmail(ctx, req.email);
    if (!recipient) {
      this.logger.warn(`Email link as ${req.as} on ${ctx.tenant.slug} for an address with no account`);
      return { sent: true };
    }
    const result = await this.links.send(ctx, recipient);
    // Too many: say nothing different, so the page cannot tell who has an account.
    return { sent: result.sent || result.reason === 'too_many' };
  }

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

  private async staffByEmail(ctx: RequestContext, email: string): Promise<SignInLinkRecipient | undefined> {
    const [u] = await ctx.tx.select().from(users).where(and(eq(sql`lower(${users.email})`, email), eq(users.active, true)));
    return u && { kind: 'staff', id: u.id, email: u.email, name: u.name };
  }

  /** Exactly one current employee with this email, as at sign-in. */
  private async employeeByEmail(ctx: RequestContext, email: string): Promise<SignInLinkRecipient | undefined> {
    const found = await ctx.tx.select().from(employees).where(and(eq(sql`lower(${employees.email})`, email), ne(employees.status, '離職'))).limit(2);
    const e = found.length === 1 ? found[0] : undefined;
    return e && { kind: 'employee', id: e.id, email: e.email!, name: e.name, lang: e.lang };
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
