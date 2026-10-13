/*
 * Online customer chat (線上客服) on the marketing site. Visitors chat without signing in: starting a chat hands their
 * browser a random token, and every later call carries it in X-Chat-Token (only its hash is stored). The load balancer
 * exposes only /platform-api/public/* on the site's host. Platform staff with chat:manage answer, close and reopen
 * conversations in the platform admin. The chat window asks for new messages every few seconds; there is no socket.
 */
import {
  Body, Controller, Get, HttpCode, HttpException, Inject, Logger, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional,
  ApiQuery, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { chatAuthorEnum, chatConversations, chatConversationStatusEnum, chatMessages, platformAuditLog, type Db } from '@yutis/db';
import { CHAT_KEEP_DAYS, CHAT_MESSAGE_MAX, CHAT_NAME_MAX } from '@yutis/domain';
import { and, asc, count, desc, eq, gt, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Public, Requires } from '../auth/access.js';
import type { PlatformConfig } from '../config.js';
import { recordPlatformAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { DB, PLATFORM_CONFIG } from '../core/database.js';
import { ApiErrorDto } from '../core/errors.js';
import { MAILER, maskEmail, type Mail, type Mailer } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { chatToAnswer, staffReplied, type ChatVisitor } from './emails.js';

type ConversationStatus = (typeof chatConversationStatusEnum.enumValues)[number];
type Author = (typeof chatAuthorEnum.enumValues)[number];

export const CHAT_TOKEN_HEADER = 'x-chat-token';
/** Where visitors can write when nobody answers; also on the site (apps/site/src/trial-form.ts). */
const CONTACT_EMAIL = 'care@yutis.net';
/** Faster than any person types a first message. */
const MIN_FILL_MS = 2_000;
/** Chats one client address may start per day. */
const DAILY_LIMIT_PER_ADDRESS = 5;
/** Visitor messages one conversation accepts per ten minutes. */
const MESSAGES_PER_10_MIN = 30;
/** The window asks every few seconds while open and every 20 s while folded; quieter than this means they left. */
export const VISITOR_AWAY_MS = 45_000;
const CLOSED_NOTICE = '客服已結束這段對話。如有其他問題，直接在下方留言即可。';

const messageBody = z.string().trim().min(1).max(CHAT_MESSAGE_MAX);

export const StartChat = z.object({
  name: z.string().trim().min(1).max(CHAT_NAME_MAX),
  email: z.email().trim().toLowerCase().max(254).nullish().or(z.literal('')).transform(v => v || null),
  companyName: z.string().trim().max(CHAT_NAME_MAX).nullish().transform(v => v || null),
  message: messageBody,
  page: z.string().trim().max(200).regex(/^\//).nullish().transform(v => v || null),
  consent: z.literal(true),
  /** Honeypot: a field people never see. Anything in it means a bot. */
  website: z.string().max(200).optional(),
  /** Milliseconds between opening the window and starting the chat. */
  elapsedMs: z.number().nonnegative().optional(),
}).strict();

const SendMessage = z.object({ body: messageBody }).strict();

class VisitorMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: chatAuthorEnum.enumValues, description: 'visitor：訪客；staff：Yutis Care 客服（不顯示是哪位）；system：系統訊息' }) author!: Author;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

class VisitorConversationDto {
  @ApiProperty({ enum: chatConversationStatusEnum.enumValues }) status!: ConversationStatus;
  @ApiProperty({ type: [VisitorMessageDto], description: '依時間先後；帶 after 時只有之後的訊息' }) messages!: VisitorMessageDto[];
}

class StartedChatDto extends VisitorConversationDto {
  @ApiProperty({ description: '之後每個請求放在 X-Chat-Token 標頭；只存在訪客的瀏覽器' }) token!: string;
}

class StaffMessageDto extends VisitorMessageDto {
  @ApiProperty({ type: String, nullable: true, description: 'author=staff 時回覆的平台人員' }) staffName!: string | null;
}

export class ChatConversationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: chatConversationStatusEnum.enumValues, description: '進行中、已結束' }) status!: ConversationStatus;
  @ApiProperty() visitorName!: string;
  @ApiProperty({ type: String, nullable: true }) visitorEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) companyName!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '在官網哪一頁開始對話' }) page!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) lastMessageAt!: Date;
  @ApiProperty({ type: String, nullable: true, description: '最後一則訊息（截短）' }) lastMessage!: string | null;
  @ApiProperty({ enum: chatAuthorEnum.enumValues, nullable: true }) lastAuthor!: Author | null;
  @ApiProperty({ description: '平台人員還沒看過的訪客訊息數' }) unread!: number;
  @ApiProperty({ description: '訪客還開著官網（最近 45 秒內有連線）' }) visitorOnline!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) closedAt!: Date | null;
}

class ChatConversationDetailDto extends ChatConversationDto {
  @ApiProperty({ type: [StaffMessageDto] }) messages!: StaffMessageDto[];
}

const notFound = () => new NotFoundException({ code: 'chat_not_found', message: 'No such conversation' });
const tooMany = (message: string) => new HttpException({ code: 'too_many_requests', message }, 429);

export const hashChatToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** The client address is only kept hashed; it is used to limit how many chats one address may start. */
export const hashChatAddress = (ip: string) => createHash('sha256').update(`yutis-chat:${ip}`).digest('hex');

const toVisitorMessage = (m: typeof chatMessages.$inferSelect): VisitorMessageDto => ({ id: m.id, author: m.author, body: m.body, createdAt: m.createdAt });

@ApiTags('chat')
@Controller()
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  // ---- Visitors (官網，不需登入) ----

  @Post('public/chat/conversations')
  @HttpCode(201)
  @Public()
  @ApiOperation({
    summary: '開始線上客服對話（官網，不需登入）',
    description: '儲存第一則訊息並以 Email 通知平台人員。回傳的 token 之後放在 X-Chat-Token 標頭。同一個來源每天最多開 5 段對話。',
  })
  @ApiBody({ schema: openApiSchema(StartChat) })
  @ApiCreatedResponse({ type: StartedChatDto })
  @ApiBadRequestResponse({ description: 'validation_failed', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async start(@Req() request: FastifyRequest, @Body() body: unknown): Promise<StartedChatDto> {
    const input = parse(StartChat, body);
    const token = randomBytes(32).toString('base64url');
    // Bots get an answer shaped like a person's, so they learn nothing; nothing is stored or sent.
    if (input.website || (input.elapsedMs !== undefined && input.elapsedMs < MIN_FILL_MS)) {
      return { token, status: 'open', messages: [{ id: randomBytes(16).toString('hex'), author: 'visitor', body: input.message, createdAt: new Date() }] };
    }
    const ipHash = hashChatAddress(request.ip);
    const since = new Date(Date.now() - 86_400_000);
    const { conversation, message } = await this.db.transaction(async tx => {
      const [recent] = await tx.select({ n: count() }).from(chatConversations)
        .where(and(eq(chatConversations.ipHash, ipHash), gte(chatConversations.createdAt, since)));
      if ((recent?.n ?? 0) >= DAILY_LIMIT_PER_ADDRESS) throw tooMany('Too many chats from this address today');
      await tx.delete(chatConversations).where(lt(chatConversations.lastMessageAt, sql`now() - make_interval(days => ${CHAT_KEEP_DAYS})`));
      const [conversation] = await tx.insert(chatConversations).values({
        visitorName: input.name, visitorEmail: input.email, companyName: input.companyName, tokenHash: hashChatToken(token), ipHash,
        page: input.page, consentedAt: new Date(), visitorSeenAt: new Date(),
      }).returning();
      const [message] = await tx.insert(chatMessages).values({ conversationId: conversation!.id, author: 'visitor', body: input.message }).returning();
      await tx.insert(platformAuditLog).values({
        actorEmail: input.email ?? 'visitor', action: 'chat.start', subjectTable: 'chat_conversations', subjectId: conversation!.id,
        detail: { page: input.page }, ip: request.ip, userAgent: request.headers['user-agent'],
      });
      return { conversation: conversation!, message: message! };
    });
    await this.notifyStaff(conversation, message, false);
    return { token, status: 'open', messages: [toVisitorMessage(message)] };
  }

  @Get('public/chat/conversation')
  @Public()
  @ApiOperation({ summary: '訪客讀取自己的對話（官網輪詢）', description: '依 X-Chat-Token 找到對話。帶 after（ISO 時間）時只回之後的訊息。' })
  @ApiHeader({ name: CHAT_TOKEN_HEADER, required: true })
  @ApiQuery({ name: 'after', required: false, description: 'ISO 8601 時間' })
  @ApiOkResponse({ type: VisitorConversationDto })
  @ApiUnauthorizedResponse({ description: 'chat_token_invalid：token 不對或對話已刪除，請重新開始', type: ApiErrorDto })
  async visitorRead(@Req() request: FastifyRequest, @Query('after') after?: string): Promise<VisitorConversationDto> {
    const since = after === undefined ? undefined : parse(z.iso.datetime({ offset: true }), after);
    const conversation = await this.byToken(request);
    await this.db.update(chatConversations).set({ visitorSeenAt: new Date() }).where(eq(chatConversations.id, conversation.id));
    const messages = await this.db.select().from(chatMessages)
      .where(and(eq(chatMessages.conversationId, conversation.id), since ? gt(chatMessages.createdAt, new Date(since)) : undefined))
      .orderBy(asc(chatMessages.createdAt));
    return { status: conversation.status, messages: messages.map(toVisitorMessage) };
  }

  @Post('public/chat/conversation/messages')
  @HttpCode(201)
  @Public()
  @ApiOperation({ summary: '訪客留言', description: '已結束的對話會重新開啟並通知平台人員。每段對話 10 分鐘內最多 30 則。' })
  @ApiHeader({ name: CHAT_TOKEN_HEADER, required: true })
  @ApiBody({ schema: openApiSchema(SendMessage) })
  @ApiCreatedResponse({ type: VisitorMessageDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async visitorSend(@Req() request: FastifyRequest, @Body() body: unknown): Promise<VisitorMessageDto> {
    const input = parse(SendMessage, body);
    const found = await this.byToken(request);
    const { conversation, message, reopened } = await this.db.transaction(async tx => {
      const [conversation] = await tx.select().from(chatConversations).where(eq(chatConversations.id, found.id)).for('update');
      if (!conversation) throw new UnauthorizedException({ code: 'chat_token_invalid', message: 'Start a new conversation' });
      const [recent] = await tx.select({ n: count() }).from(chatMessages).where(and(
        eq(chatMessages.conversationId, conversation.id), eq(chatMessages.author, 'visitor'), gte(chatMessages.createdAt, new Date(Date.now() - 600_000))));
      if ((recent?.n ?? 0) >= MESSAGES_PER_10_MIN) throw tooMany('Too many messages; please wait a moment');
      const [message] = await tx.insert(chatMessages).values({ conversationId: conversation.id, author: 'visitor', body: input.body }).returning();
      const reopened = conversation.status === 'closed';
      await tx.update(chatConversations).set({
        lastMessageAt: message!.createdAt, visitorSeenAt: new Date(), ...(reopened ? { status: 'open', closedAt: null, closedBy: null } : {}),
      }).where(eq(chatConversations.id, conversation.id));
      return { conversation, message: message!, reopened };
    });
    if (reopened) await this.notifyStaff(conversation, message, true);
    return toVisitorMessage(message);
  }

  // ---- Platform staff (平台管理後台) ----

  @Get('chat/conversations')
  @Requires('chat:manage')
  @ApiOperation({ summary: '線上客服對話列表', description: '最近有訊息的在前。status 不給時列出全部。' })
  @ApiQuery({ name: 'status', required: false, enum: chatConversationStatusEnum.enumValues })
  @ApiOkResponse({ type: [ChatConversationDto] })
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string): Promise<ChatConversationDto[]> {
    const filter = status === undefined ? undefined : parse(z.enum(chatConversationStatusEnum.enumValues), status);
    return this.select(ctx, filter ? eq(chatConversations.status, filter) : undefined);
  }

  @Get('chat/conversations/:id')
  @Requires('chat:manage')
  @ApiOperation({ summary: '一段對話與全部訊息', description: '同時標為已讀。' })
  @ApiOkResponse({ type: ChatConversationDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ChatConversationDetailDto> {
    const updated = await ctx.tx.update(chatConversations).set({ staffReadAt: new Date() }).where(eq(chatConversations.id, id)).returning({ id: chatConversations.id });
    if (!updated.length) throw notFound();
    return this.one(ctx, id);
  }

  @Post('chat/conversations/:id/messages')
  @HttpCode(201)
  @Requires('chat:manage')
  @ApiOperation({
    summary: '回覆訪客',
    description: '已結束的對話會重新開啟。訪客已離開官網（45 秒沒有連線）且留了 Email 時，回覆也會寄到訪客信箱。',
  })
  @ApiBody({ schema: openApiSchema(SendMessage) })
  @ApiCreatedResponse({ type: ChatConversationDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async reply(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ChatConversationDetailDto> {
    const input = parse(SendMessage, body);
    const [conversation] = await ctx.tx.select().from(chatConversations).where(eq(chatConversations.id, id)).for('update');
    if (!conversation) throw notFound();
    const [message] = await ctx.tx.insert(chatMessages).values({ conversationId: id, author: 'staff', staffId: ctx.user.id, body: input.body }).returning();
    await ctx.tx.update(chatConversations).set({ lastMessageAt: message!.createdAt, staffReadAt: new Date(), status: 'open', closedAt: null, closedBy: null })
      .where(eq(chatConversations.id, id));
    await recordPlatformAudit(ctx, { action: 'chat.reply', subjectTable: 'chat_conversations', subjectId: id, detail: { messageId: message!.id } });
    const away = !conversation.visitorSeenAt || Date.now() - conversation.visitorSeenAt.getTime() > VISITOR_AWAY_MS;
    if (away && conversation.visitorEmail) {
      // Inside the request's transaction: the reply and its email go together, and the idempotency key stops a resend.
      await this.send(staffReplied({ ...conversation, visitorEmail: conversation.visitorEmail }, message!, this.config.tenantBaseDomain, CONTACT_EMAIL), id);
    }
    return this.one(ctx, id);
  }

  @Post('chat/conversations/:id/close')
  @HttpCode(200)
  @Requires('chat:manage')
  @ApiOperation({ summary: '結束對話', description: '訪客會看到對話已結束；訪客再留言時自動重新開啟。' })
  @ApiOkResponse({ type: ChatConversationDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ChatConversationDetailDto> {
    const [conversation] = await ctx.tx.select({ status: chatConversations.status }).from(chatConversations).where(eq(chatConversations.id, id)).for('update');
    if (!conversation) throw notFound();
    if (conversation.status === 'open') {
      const [notice] = await ctx.tx.insert(chatMessages).values({ conversationId: id, author: 'system', body: CLOSED_NOTICE }).returning();
      await ctx.tx.update(chatConversations).set({ status: 'closed', closedAt: new Date(), closedBy: ctx.user.id, lastMessageAt: notice!.createdAt, staffReadAt: new Date() })
        .where(eq(chatConversations.id, id));
    }
    await recordPlatformAudit(ctx, { action: 'chat.close', subjectTable: 'chat_conversations', subjectId: id });
    return this.one(ctx, id);
  }

  @Post('chat/conversations/:id/reopen')
  @HttpCode(200)
  @Requires('chat:manage')
  @ApiOperation({ summary: '重新開啟對話' })
  @ApiOkResponse({ type: ChatConversationDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async reopen(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ChatConversationDetailDto> {
    const updated = await ctx.tx.update(chatConversations).set({ status: 'open', closedAt: null, closedBy: null }).where(eq(chatConversations.id, id))
      .returning({ id: chatConversations.id });
    if (!updated.length) throw notFound();
    await recordPlatformAudit(ctx, { action: 'chat.reopen', subjectTable: 'chat_conversations', subjectId: id });
    return this.one(ctx, id);
  }

  private async byToken(request: FastifyRequest) {
    const header = request.headers[CHAT_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    const invalid = () => new UnauthorizedException({ code: 'chat_token_invalid', message: 'Start a new conversation' });
    if (!token || token.length > 100) throw invalid();
    const [conversation] = await this.db.select({ id: chatConversations.id, status: chatConversations.status }).from(chatConversations)
      .where(eq(chatConversations.tokenHash, hashChatToken(token)));
    if (!conversation) throw invalid();
    return conversation;
  }

  /** After the commit, so nobody hears about a message that was not stored. A failed email fails nothing. */
  private async notifyStaff(conversation: ChatVisitor, message: { id: string; body: string }, reopened: boolean) {
    for (const to of this.config.chatNotifyEmails) {
      await this.send(chatToAnswer(conversation, message, to, this.config.tenantBaseDomain, reopened), conversation.id);
    }
  }

  private async send(mail: Mail, conversationId: string) {
    try {
      await this.mailer.send(mail);
    } catch (error) {
      this.logger.warn(`Chat ${conversationId}: email to ${maskEmail(mail.to)} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async one(ctx: RequestContext, id: string): Promise<ChatConversationDetailDto> {
    const [conversation] = await this.select(ctx, eq(chatConversations.id, id));
    if (!conversation) throw notFound();
    const messages = await ctx.tx.select({
      message: chatMessages,
      staffName: sql<string | null>`(select name from platform_users p where p.id = ${chatMessages.staffId})`,
    }).from(chatMessages).where(eq(chatMessages.conversationId, id)).orderBy(asc(chatMessages.createdAt));
    return { ...conversation, messages: messages.map(({ message, staffName }) => ({ ...toVisitorMessage(message), staffName })) };
  }

  private async select(ctx: RequestContext, where: SQL | undefined): Promise<ChatConversationDto[]> {
    const c = chatConversations;
    // Subqueries name the outer table in full: Drizzle leaves single-table columns unqualified, which would bind to m.
    const rows = await ctx.tx.select({
      conversation: c,
      lastMessage: sql<string | null>`(select left(m.body, 120) from chat_messages m where m.conversation_id = chat_conversations.id order by m.created_at desc limit 1)`,
      lastAuthor: sql<Author | null>`(select m.author from chat_messages m where m.conversation_id = chat_conversations.id order by m.created_at desc limit 1)`,
      unread: sql<number>`(select count(*)::int from chat_messages m where m.conversation_id = chat_conversations.id and m.author = 'visitor'
        and m.created_at > coalesce(chat_conversations.staff_read_at, '-infinity'::timestamptz))`,
    }).from(c).where(where).orderBy(desc(c.lastMessageAt));
    const now = Date.now();
    return rows.map(({ conversation: x, lastMessage, lastAuthor, unread }) => ({
      id: x.id, status: x.status, visitorName: x.visitorName, visitorEmail: x.visitorEmail, companyName: x.companyName, page: x.page,
      createdAt: x.createdAt, lastMessageAt: x.lastMessageAt, lastMessage, lastAuthor, unread,
      visitorOnline: !!x.visitorSeenAt && now - x.visitorSeenAt.getTime() <= VISITOR_AWAY_MS, closedAt: x.closedAt,
    }));
  }
}
