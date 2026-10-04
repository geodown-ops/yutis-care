/*
 * Sign-off chains (簽核): the tenant's sign-off roles, the signers on a record, and their one-time email links. Shared
 * by 附表八 service records and violence-prevention reviews; signers sign at /api/sign/:token (SignController), and the
 * record is complete when every signer has signed.
 */
import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { signatures, sites, tenantSettings } from '@yutis/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { tenantOrigin, type ApiConfig } from '../config.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { signatureEmail } from '../core/emails.js';
import type { Notifier } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { hashToken, SIGN_LINK_DAYS } from '../programs/advice.controller.js';

/** Records that go through a sign-off chain, by table, with the title signers see. */
export const SIGNED_DOCUMENTS = {
  service_records: '勞工健康服務執行紀錄表（附表八）',
  violence_reviews: '執行職務遭受不法侵害預防措施查核及評估',
} as const;
export type SignedTable = keyof typeof SIGNED_DOCUMENTS;

export const Signer = z.object({ role: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(100), email: z.email().toLowerCase() }).strict();
export type SignerInput = z.infer<typeof Signer>;

export class SignatureDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '人力資源管理人員' }) role!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '第一次寄出簽核連結' }) firstSentAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '最近一次寄出（重寄會更新）' }) sentAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) signedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) comment!: string | null;
}

export class SignLinkDto {
  @ApiProperty({ format: 'uuid' }) signatureId!: string;
  @ApiProperty() role!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '一次性簽核連結（只回傳這一次，不儲存）；同時寄給簽核人員' }) url!: string;
}

export async function signOffRoles(ctx: RequestContext): Promise<string[]> {
  const [setting] = await ctx.tx.select().from(tenantSettings).where(eq(tenantSettings.key, 'sign_off_roles'));
  return (setting?.value ?? []) as string[];
}

/** Every signer's role must be one of the tenant's sign-off roles. */
export async function assertSignOffRoles(ctx: RequestContext, signers: SignerInput[]): Promise<void> {
  const roles = await signOffRoles(ctx);
  const bad = signers.filter(s => !roles.includes(s.role));
  if (bad.length) throw new BadRequestException({ code: 'unknown_sign_off_role', message: `Not a configured sign-off role: ${bad.map(s => s.role).join(', ')}` });
}

export async function replaceSigners(ctx: RequestContext, subjectTable: SignedTable, id: string, signers: SignerInput[]): Promise<void> {
  await ctx.tx.delete(signatures).where(and(eq(signatures.subjectTable, subjectTable), eq(signatures.subjectId, id)));
  if (!signers.length) return;
  // created_at keeps the signers in the order given (now() is the same for the whole transaction).
  const start = Date.now();
  await ctx.tx.insert(signatures).values(signers.map((s, i) => ({
    tenantId: ctx.tenant.id, subjectTable, subjectId: id, signerRole: s.role, signerName: s.name, signerEmail: s.email,
    createdAt: new Date(start + i), createdBy: staff(ctx).userId,
  })));
}

export async function deleteSigners(ctx: RequestContext, subjectTable: SignedTable, id: string): Promise<void> {
  await ctx.tx.delete(signatures).where(and(eq(signatures.subjectTable, subjectTable), eq(signatures.subjectId, id)));
}

/** Signers of each record, in the order given. */
export async function signaturesOf(ctx: RequestContext, subjectTable: SignedTable, ids: string[]): Promise<Map<string, SignatureDto[]>> {
  const rows = ids.length
    ? await ctx.tx.select().from(signatures).where(and(eq(signatures.subjectTable, subjectTable), inArray(signatures.subjectId, ids))).orderBy(asc(signatures.createdAt))
    : [];
  const bySubject = new Map<string, SignatureDto[]>();
  for (const s of rows) {
    bySubject.set(s.subjectId, [...bySubject.get(s.subjectId) ?? [], {
      id: s.id, role: s.signerRole, name: s.signerName, email: s.signerEmail, firstSentAt: s.firstSentAt, sentAt: s.lastSentAt, signedAt: s.signedAt, comment: s.comment,
    }]);
  }
  return bySubject;
}

/**
 * A new one-time link for one signer (any earlier link stops working), emailed to them once the request commits.
 * `record` says what is being signed: which site, which date.
 */
export async function issueSignLink(
  ctx: RequestContext, deps: { config: ApiConfig; notifier: Notifier },
  sig: typeof signatures.$inferSelect, record: { siteId: string; on: string },
): Promise<SignLinkDto> {
  const token = randomBytes(32).toString('base64url');
  await ctx.tx.update(signatures).set({
    tokenHash: hashToken(token), tokenExpiresAt: new Date(Date.now() + SIGN_LINK_DAYS * 86_400_000), firstSentAt: sig.firstSentAt ?? new Date(), lastSentAt: new Date(), updatedAt: new Date(),
  }).where(eq(signatures.id, sig.id));
  await recordAudit(ctx, { action: 'update', subjectTable: 'signatures', subjectId: sig.id, reason: `sign link sent to ${sig.signerRole} ${sig.signerName}` });
  const url = `${tenantOrigin(deps.config, ctx.tenant.slug)}/sign/${token}`;
  const [site] = await ctx.tx.select({ name: sites.name }).from(sites).where(eq(sites.id, record.siteId));
  await deps.notifier.email(ctx, signatureEmail({
    to: sig.signerEmail, signatureId: sig.id, signerName: sig.signerName, role: sig.signerRole, tenantName: ctx.tenant.name,
    title: SIGNED_DOCUMENTS[sig.subjectTable as SignedTable] ?? '紀錄', siteName: site?.name ?? '', on: record.on, url, days: SIGN_LINK_DAYS,
  }));
  return { signatureId: sig.id, role: sig.signerRole, name: sig.signerName, url };
}

const SignOffRoles = z.object({ roles: z.array(z.string().trim().min(1).max(50)).min(1).max(30) }).strict()
  .refine(r => new Set(r.roles).size === r.roles.length, { message: 'Roles must not repeat', path: ['roles'] });

@ApiTags('admin')
@Controller('admin/sign-off-roles')
export class SignOffRolesController {
  @Get()
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({ summary: '簽核角色設定', description: '附表八與不法侵害預防措施查核可指定的簽核人員角色。' })
  @ApiOkResponse({ type: [String] })
  list(@Ctx() ctx: RequestContext): Promise<string[]> {
    return signOffRoles(ctx);
  }

  @Put()
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({ summary: '修改簽核角色', description: '整份取代，依送出的順序顯示。已建立的紀錄保留原本的簽核角色。' })
  @ApiBody({ schema: openApiSchema(SignOffRoles) })
  @ApiOkResponse({ type: [String] })
  async replace(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<string[]> {
    const { roles } = parse(SignOffRoles, body);
    await ctx.tx.insert(tenantSettings).values({ tenantId: ctx.tenant.id, key: 'sign_off_roles', value: roles, createdBy: staff(ctx).userId })
      .onConflictDoUpdate({ target: [tenantSettings.tenantId, tenantSettings.key], set: { value: roles, updatedAt: new Date(), updatedBy: staff(ctx).userId } });
    await recordAudit(ctx, { action: 'update', subjectTable: 'tenant_settings', reason: `sign_off_roles: ${roles.join('、')}` });
    return roles;
  }
}
