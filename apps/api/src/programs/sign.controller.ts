/*
 * Emailed one-time links (/api/sign/:token): open exactly one record without signing in, and confirm it once. The
 * token is single-use and expires; only its SHA-256 is stored. The lookup runs in the URL's tenant, so a link only
 * works on its own tenant's subdomain.
 */
import { Body, Controller, Get, GoneException, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBody, ApiGoneResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { employeeAcknowledgements } from '@yutis/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Public } from '../auth/access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { ApiErrorDto } from '../core/errors.js';
import { openApiSchema, parse } from '../core/validation.js';
import { AcknowledgementDto, acknowledgementDocument } from './acknowledgements.js';
import { hashToken } from './advice.controller.js';

const Confirm = z.object({ comment: z.string().trim().max(1000).optional() }).strict();

@ApiTags('sign')
@Controller('sign')
export class SignController {
  @Get(':token')
  @Public()
  @ApiOperation({ summary: '以一次性連結開啟要確認的紀錄', description: '開啟不會讓連結失效；確認後才失效。' })
  @ApiOkResponse({ type: AcknowledgementDto })
  @ApiGoneResponse({ description: '連結已使用（token_used）或已過期（token_expired）', type: ApiErrorDto })
  async open(@Ctx() ctx: RequestContext, @Param('token') token: string): Promise<AcknowledgementDto> {
    const ack = await this.find(ctx, token);
    await recordAudit(ctx, { action: 'read', subjectTable: 'employee_acknowledgements', subjectId: ack.id, employeeId: ack.employeeId, reason: 'sign link opened' }, employeeActor(ack.employeeId));
    return acknowledgementDocument(ctx.tx, ack);
  }

  @Post(':token')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '以一次性連結確認紀錄', description: '確認後連結立即失效，不能再用。' })
  @ApiBody({ schema: openApiSchema(Confirm) })
  @ApiOkResponse({ type: AcknowledgementDto })
  @ApiGoneResponse({ type: ApiErrorDto })
  async confirm(@Ctx() ctx: RequestContext, @Param('token') token: string, @Body() body: unknown): Promise<AcknowledgementDto> {
    const { comment } = parse(Confirm, body ?? {});
    const ack = await this.find(ctx, token);
    const [row] = await ctx.tx.update(employeeAcknowledgements).set({ confirmedAt: new Date(), comment: comment ?? null, tokenHash: null, tokenExpiresAt: null, updatedAt: new Date() })
      .where(eq(employeeAcknowledgements.id, ack.id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'employee_acknowledgements', subjectId: ack.id, employeeId: ack.employeeId, reason: 'confirmed via sign link' }, employeeActor(ack.employeeId));
    return acknowledgementDocument(ctx.tx, row!);
  }

  private async find(ctx: RequestContext, token: string) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new NotFoundException({ code: 'token_not_found', message: 'Unknown link' });
    const [ack] = await ctx.tx.select().from(employeeAcknowledgements).where(eq(employeeAcknowledgements.tokenHash, hashToken(token)));
    if (!ack) throw new GoneException({ code: 'token_used', message: 'This link has already been used or replaced' });
    if (ack.confirmedAt) throw new GoneException({ code: 'token_used', message: 'This link has already been used' });
    if (!ack.tokenExpiresAt || ack.tokenExpiresAt < new Date()) throw new GoneException({ code: 'token_expired', message: 'This link has expired' });
    return ack;
  }
}

/** Audit actor for actions taken through an employee's emailed link. */
const employeeActor = (employeeId: string) => ({ kind: 'employee' as const, employeeId, sessionId: '', name: '', lang: '' });
