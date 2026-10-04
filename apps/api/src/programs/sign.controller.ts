/*
 * Emailed one-time links (/api/sign/:token): open exactly one record without signing in, and confirm or sign it once.
 * Two kinds share the mechanism: an employee confirming a record about them (employee_acknowledgements) and a signer
 * signing off a 附表八 service record or a violence-prevention review (signatures). The token is single-use and expires; only its SHA-256 is stored.
 * The lookup runs in the URL's tenant, so a link only works on its own tenant's subdomain.
 */
import { Body, Controller, Get, GoneException, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiGoneResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { departments, employeeAcknowledgements, serviceRecords, signatures, sites, violenceReviews } from '@yutis/db';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Public } from '../auth/access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { ApiErrorDto } from '../core/errors.js';
import { openApiSchema, parse } from '../core/validation.js';
import { SIGNED_DOCUMENTS, type SignedTable } from '../service/sign-off.js';
import { AcknowledgementContentDto, acknowledgementDocument } from './acknowledgements.js';
import { hashToken } from './advice.controller.js';

const Confirm = z.object({ comment: z.string().trim().max(1000).optional() }).strict();

class SignerDto {
  @ApiProperty({ example: '職醫' }) role!: string;
  @ApiProperty() name!: string;
}
class ServiceSignContentDto {
  @ApiProperty({ type: String, format: 'date', nullable: true }) serviceOn!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '廠區名稱' }) site!: string | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true, description: '附表八內容，格式同勞工健康服務紀錄的 content' }) record!: unknown;
  @ApiProperty({ type: SignerDto, description: '以什麼身分簽核' }) signer!: SignerDto;
}

class ReviewSignItemDto {
  @ApiProperty({ example: '辨識及評估危害' }) item!: string;
  @ApiProperty({ type: [String], description: '已檢點的重點' }) points!: string[];
  @ApiProperty() result!: string;
  @ApiProperty({ description: '修正相關控制措施／改善情形採行措施' }) fix!: string;
}
class ReviewSignContentDto {
  @ApiProperty({ type: String, format: 'date', nullable: true }) reviewedOn!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '廠區名稱' }) site!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '部門名稱' }) department!: string | null;
  @ApiProperty({ type: [ReviewSignItemDto] }) items!: ReviewSignItemDto[];
  @ApiProperty({ type: SignerDto, description: '以什麼身分簽核' }) signer!: SignerDto;
}

const DOCUMENTS = ['employee_acknowledgements', 'service_records', 'violence_reviews'] as const;

@ApiExtraModels(AcknowledgementContentDto, ServiceSignContentDto, ReviewSignContentDto)
class SignDocumentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['acknowledgement', 'signature'], description: '員工確認紀錄，或簽核（附表八、不法侵害預防措施查核）' }) kind!: 'acknowledgement' | 'signature';
  @ApiProperty({ enum: DOCUMENTS, description: '哪一種文件，決定 content 的格式' }) document!: (typeof DOCUMENTS)[number];
  @ApiProperty() title!: string;
  @ApiProperty({
    nullable: true,
    oneOf: [{ $ref: getSchemaPath(AcknowledgementContentDto) }, { $ref: getSchemaPath(ServiceSignContentDto) }, { $ref: getSchemaPath(ReviewSignContentDto) }],
    description: 'document 為 employee_acknowledgements 時是 AcknowledgementContentDto，service_records 時是 ServiceSignContentDto，violence_reviews 時是 ReviewSignContentDto',
  })
  content!: AcknowledgementContentDto | ServiceSignContentDto | ReviewSignContentDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '確認或簽核的時間' }) confirmedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) comment!: string | null;
}

type Found =
  | { kind: 'acknowledgement'; row: typeof employeeAcknowledgements.$inferSelect }
  | { kind: 'signature'; row: typeof signatures.$inferSelect };

@ApiTags('sign')
@Controller('sign')
export class SignController {
  @Get(':token')
  @Public()
  @ApiOperation({ summary: '以一次性連結開啟要確認或簽核的紀錄', description: '開啟不會讓連結失效；確認或簽核後才失效。' })
  @ApiOkResponse({ type: SignDocumentDto })
  @ApiGoneResponse({ description: '連結已使用（token_used）或已過期（token_expired）', type: ApiErrorDto })
  async open(@Ctx() ctx: RequestContext, @Param('token') token: string): Promise<SignDocumentDto> {
    const found = await this.find(ctx, token);
    if (found.kind === 'acknowledgement') {
      await recordAudit(ctx, { action: 'read', subjectTable: 'employee_acknowledgements', subjectId: found.row.id, employeeId: found.row.employeeId, reason: 'sign link opened' }, employeeActor(found.row.employeeId));
      return { kind: 'acknowledgement', document: 'employee_acknowledgements', ...await acknowledgementDocument(ctx.tx, found.row) };
    }
    await recordAudit(ctx, { action: 'read', subjectTable: 'signatures', subjectId: found.row.id, reason: `sign link opened by ${found.row.signerRole} ${found.row.signerName}` }, undefined);
    return this.signedDocument(ctx, found.row);
  }

  @Post(':token')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '以一次性連結確認或簽核', description: '完成後連結立即失效，不能再用。所有簽核人員都簽核後，紀錄狀態變為已完成。' })
  @ApiBody({ schema: openApiSchema(Confirm) })
  @ApiOkResponse({ type: SignDocumentDto })
  @ApiGoneResponse({ type: ApiErrorDto })
  async confirm(@Ctx() ctx: RequestContext, @Param('token') token: string, @Body() body: unknown): Promise<SignDocumentDto> {
    const { comment } = parse(Confirm, body ?? {});
    const found = await this.find(ctx, token);
    const done = { comment: comment ?? null, tokenHash: null, tokenExpiresAt: null, updatedAt: new Date() };
    if (found.kind === 'acknowledgement') {
      const [row] = await ctx.tx.update(employeeAcknowledgements).set({ ...done, confirmedAt: new Date() }).where(eq(employeeAcknowledgements.id, found.row.id)).returning();
      await recordAudit(ctx, { action: 'update', subjectTable: 'employee_acknowledgements', subjectId: found.row.id, employeeId: found.row.employeeId, reason: 'confirmed via sign link' }, employeeActor(found.row.employeeId));
      return { kind: 'acknowledgement', document: 'employee_acknowledgements', ...await acknowledgementDocument(ctx.tx, row!) };
    }
    const [row] = await ctx.tx.update(signatures).set({ ...done, signedAt: new Date() }).where(eq(signatures.id, found.row.id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'signatures', subjectId: found.row.id, reason: `signed by ${found.row.signerRole} ${found.row.signerName}` }, undefined);
    const remaining = await ctx.tx.select({ id: signatures.id }).from(signatures)
      .where(and(eq(signatures.subjectTable, found.row.subjectTable), eq(signatures.subjectId, found.row.subjectId), isNull(signatures.signedAt)));
    if (!remaining.length) {
      const subject = found.row.subjectTable;
      if (subject === 'service_records') await ctx.tx.update(serviceRecords).set({ status: '已完成', updatedAt: new Date() }).where(eq(serviceRecords.id, found.row.subjectId));
      if (subject === 'violence_reviews') await ctx.tx.update(violenceReviews).set({ status: '已完成', updatedAt: new Date() }).where(eq(violenceReviews.id, found.row.subjectId));
      await recordAudit(ctx, { action: 'update', subjectTable: subject, subjectId: found.row.subjectId, reason: 'all signers signed; completed' }, undefined);
    }
    return this.signedDocument(ctx, row!);
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

  /** What a signer sees: the record they are asked to sign, and who they sign as. */
  private async signedDocument(ctx: RequestContext, sig: typeof signatures.$inferSelect): Promise<SignDocumentDto> {
    const signer = { role: sig.signerRole, name: sig.signerName };
    const base = { id: sig.id, kind: 'signature' as const, title: SIGNED_DOCUMENTS[sig.subjectTable as SignedTable] ?? '', confirmedAt: sig.signedAt, comment: sig.comment };
    if (sig.subjectTable === 'violence_reviews') {
      const [review] = await ctx.tx.select({ r: violenceReviews, site: sites.name, department: departments.name }).from(violenceReviews)
        .innerJoin(sites, eq(sites.id, violenceReviews.siteId)).leftJoin(departments, eq(departments.id, violenceReviews.departmentId))
        .where(eq(violenceReviews.id, sig.subjectId));
      return {
        ...base, document: 'violence_reviews',
        content: { reviewedOn: review?.r.reviewedOn ?? null, site: review?.site ?? null, department: review?.department ?? null, items: (review?.r.items ?? []) as ReviewSignItemDto[], signer },
      };
    }
    const [record] = await ctx.tx.select({ r: serviceRecords, site: sites.name }).from(serviceRecords).innerJoin(sites, eq(sites.id, serviceRecords.siteId)).where(eq(serviceRecords.id, sig.subjectId));
    return {
      ...base, document: 'service_records',
      content: { serviceOn: record?.r.serviceOn ?? null, site: record?.site ?? null, record: record?.r.content ?? null, signer },
    };
  }
}

/** Audit actor for actions taken through an employee's emailed link. */
const employeeActor = (employeeId: string) => ({ kind: 'employee' as const, employeeId, sessionId: '', name: '', lang: '' });
