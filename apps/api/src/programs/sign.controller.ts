/*
 * Emailed one-time links (/api/sign/:token): open exactly one record without signing in, and confirm or sign it once.
 * Two kinds share the mechanism: an employee confirming a record about them (employee_acknowledgements) and a signer
 * signing off a 附表八 service record (signatures). The token is single-use and expires; only its SHA-256 is stored.
 * The lookup runs in the URL's tenant, so a link only works on its own tenant's subdomain.
 */
import { Body, Controller, Get, GoneException, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBody, ApiGoneResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { employeeAcknowledgements, serviceRecords, signatures, sites } from '@yutis/db';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Public } from '../auth/access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { ApiErrorDto } from '../core/errors.js';
import { openApiSchema, parse } from '../core/validation.js';
import { AcknowledgementDto, acknowledgementDocument } from './acknowledgements.js';
import { hashToken } from './advice.controller.js';

const Confirm = z.object({ comment: z.string().trim().max(1000).optional() }).strict();

type Found =
  | { kind: 'acknowledgement'; row: typeof employeeAcknowledgements.$inferSelect }
  | { kind: 'signature'; row: typeof signatures.$inferSelect };

@ApiTags('sign')
@Controller('sign')
export class SignController {
  @Get(':token')
  @Public()
  @ApiOperation({ summary: '以一次性連結開啟要確認或簽核的紀錄', description: '開啟不會讓連結失效；確認或簽核後才失效。' })
  @ApiOkResponse({ type: AcknowledgementDto })
  @ApiGoneResponse({ description: '連結已使用（token_used）或已過期（token_expired）', type: ApiErrorDto })
  async open(@Ctx() ctx: RequestContext, @Param('token') token: string): Promise<AcknowledgementDto> {
    const found = await this.find(ctx, token);
    if (found.kind === 'acknowledgement') {
      await recordAudit(ctx, { action: 'read', subjectTable: 'employee_acknowledgements', subjectId: found.row.id, employeeId: found.row.employeeId, reason: 'sign link opened' }, employeeActor(found.row.employeeId));
      return acknowledgementDocument(ctx.tx, found.row);
    }
    await recordAudit(ctx, { action: 'read', subjectTable: 'signatures', subjectId: found.row.id, reason: `sign link opened by ${found.row.signerRole} ${found.row.signerName}` }, undefined);
    return this.serviceDocument(ctx, found.row);
  }

  @Post(':token')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '以一次性連結確認或簽核', description: '完成後連結立即失效，不能再用。附表八所有簽核人員都簽核後，紀錄狀態變為已完成。' })
  @ApiBody({ schema: openApiSchema(Confirm) })
  @ApiOkResponse({ type: AcknowledgementDto })
  @ApiGoneResponse({ type: ApiErrorDto })
  async confirm(@Ctx() ctx: RequestContext, @Param('token') token: string, @Body() body: unknown): Promise<AcknowledgementDto> {
    const { comment } = parse(Confirm, body ?? {});
    const found = await this.find(ctx, token);
    const done = { comment: comment ?? null, tokenHash: null, tokenExpiresAt: null, updatedAt: new Date() };
    if (found.kind === 'acknowledgement') {
      const [row] = await ctx.tx.update(employeeAcknowledgements).set({ ...done, confirmedAt: new Date() }).where(eq(employeeAcknowledgements.id, found.row.id)).returning();
      await recordAudit(ctx, { action: 'update', subjectTable: 'employee_acknowledgements', subjectId: found.row.id, employeeId: found.row.employeeId, reason: 'confirmed via sign link' }, employeeActor(found.row.employeeId));
      return acknowledgementDocument(ctx.tx, row!);
    }
    const [row] = await ctx.tx.update(signatures).set({ ...done, signedAt: new Date() }).where(eq(signatures.id, found.row.id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'signatures', subjectId: found.row.id, reason: `signed by ${found.row.signerRole} ${found.row.signerName}` }, undefined);
    const remaining = await ctx.tx.select({ id: signatures.id }).from(signatures)
      .where(and(eq(signatures.subjectTable, found.row.subjectTable), eq(signatures.subjectId, found.row.subjectId), isNull(signatures.signedAt)));
    if (!remaining.length && found.row.subjectTable === 'service_records') {
      await ctx.tx.update(serviceRecords).set({ status: '已完成', updatedAt: new Date() }).where(eq(serviceRecords.id, found.row.subjectId));
      await recordAudit(ctx, { action: 'update', subjectTable: 'service_records', subjectId: found.row.subjectId, reason: 'all signers signed; completed' }, undefined);
    }
    return this.serviceDocument(ctx, row!);
  }

  private async find(ctx: RequestContext, token: string): Promise<Found> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new NotFoundException({ code: 'token_not_found', message: 'Unknown link' });
    const hash = hashToken(token);
    const [ack] = await ctx.tx.select().from(employeeAcknowledgements).where(eq(employeeAcknowledgements.tokenHash, hash));
    const [sig] = ack ? [] : await ctx.tx.select().from(signatures).where(eq(signatures.tokenHash, hash));
    const found: Found | undefined = ack ? { kind: 'acknowledgement', row: ack } : sig ? { kind: 'signature', row: sig } : undefined;
    if (!found) throw new GoneException({ code: 'token_used', message: 'This link has already been used or replaced' });
    const finished = found.kind === 'acknowledgement' ? found.row.confirmedAt : found.row.signedAt;
    if (finished) throw new GoneException({ code: 'token_used', message: 'This link has already been used' });
    if (!found.row.tokenExpiresAt || found.row.tokenExpiresAt < new Date()) throw new GoneException({ code: 'token_expired', message: 'This link has expired' });
    return found;
  }

  /** What a signer sees: the 附表八 record they are asked to sign, and who they sign as. */
  private async serviceDocument(ctx: RequestContext, sig: typeof signatures.$inferSelect): Promise<AcknowledgementDto> {
    const [record] = await ctx.tx.select({ r: serviceRecords, site: sites.name }).from(serviceRecords).innerJoin(sites, eq(sites.id, serviceRecords.siteId)).where(eq(serviceRecords.id, sig.subjectId));
    return {
      id: sig.id, title: '勞工健康服務執行紀錄表（附表八）',
      content: { serviceOn: record?.r.serviceOn, site: record?.site, record: record?.r.content, signer: { role: sig.signerRole, name: sig.signerName } },
      confirmedAt: sig.signedAt, comment: sig.comment,
    };
  }
}

/** Audit actor for actions taken through an employee's emailed link. */
const employeeActor = (employeeId: string) => ({ kind: 'employee' as const, employeeId, sessionId: '', name: '', lang: '' });
