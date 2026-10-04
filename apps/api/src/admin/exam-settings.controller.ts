/*
 * Tenant settings for health checks: clinic import mappings (健檢匯入對照) and grading standards (分級標準). A rule set
 * is immutable once published; changing the standard means publishing a new version. Stored results keep the version
 * they were graded with, so a past grade can always be explained.
 */
import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiProperty, ApiTags } from '@nestjs/swagger';
import { examImportMappings, gradingRules, gradingRuleSets } from '@yutis/db';
import { EXAM_ITEMS } from '@yutis/domain';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { pgErrorCode } from '../core/pg.js';
import { openApiSchema, parse } from '../core/validation.js';
import { loadRuleSet } from '../exams/rules.js';
import { sendXlsx, templateWorkbook, XLSX_MIME } from './excel.js';

const itemCodes = [...new Set(EXAM_ITEMS.map(i => i.code))] as [string, ...string[]];
const header = z.string().trim().min(1).max(100);

export const ExamMapping = z.object({
  clinic: z.string().trim().min(1).max(100),
  columns: z.object({
    empNo: header.optional(), nationalId: header.optional(), examDate: header, kind: header.optional(), smoker: header.optional(),
    history: header.optional(), symptoms: header.optional(), workNote: header.optional(), specialHazard: header.optional(), specialLevel: header.optional(),
  }).strict().refine(c => c.empNo || c.nationalId, { message: 'Map the employee number (empNo) or national ID (nationalId) column' }),
  items: z.partialRecord(z.enum(itemCodes), header).refine(m => Object.keys(m).length > 0, { message: 'Map at least one exam item' }),
}).strict();
export type ExamMappingInput = z.infer<typeof ExamMapping>;

export class ExamMappingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '仁安健康管理診所' }) clinic!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: '欄位對照：columns（工號或身分證字號、檢查日期…）與 items（項目代碼 → Excel 欄名）' })
  mapping!: Omit<ExamMappingInput, 'clinic'>;
}

/** An empty workbook with a clinic's column names (required ones bold), for staff and tenant admins alike. */
export async function sendExamTemplate(ctx: RequestContext, id: string, reply: FastifyReply): Promise<Buffer> {
  const [row] = await ctx.tx.select().from(examImportMappings).where(eq(examImportMappings.id, id));
  if (!row) throw new NotFoundException({ code: 'mapping_not_found', message: 'No such import mapping' });
  const { columns: c, items } = row.mapping as Omit<ExamMappingInput, 'clinic'>;
  const required = [c.empNo ?? c.nationalId!, c.examDate];
  const optional = [c.empNo && c.nationalId, c.kind, c.smoker, c.history, c.symptoms, c.workNote, c.specialHazard, c.specialLevel, ...Object.values(items)]
    .filter((h): h is string => Boolean(h) && !required.includes(h!));
  return sendXlsx(reply, `${row.clinic}健檢匯入範本.xlsx`, await templateWorkbook([{ name: '健檢結果', required, optional: [...new Set(optional)] }]));
}

const Level = z.union([
  z.object({ lv: z.number().int().min(1).max(4), min: z.number().optional(), max: z.number().optional() }).strict(),
  z.object({ lv: z.number().int().min(1).max(4), values: z.array(z.string().min(1)).min(1) }).strict(),
]);
const Rule = z.object({
  code: z.enum(itemCodes), name: z.string().trim().min(1).max(100), sex: z.enum(['男', '女', '不限']), unit: z.string().max(20).default(''),
  type: z.enum(['number', 'text']).default('number'), src: z.enum(['manual', 'demo', 'physician']).default('manual'), levels: z.array(Level).min(1),
}).strict();
const NewRuleSet = z.object({ note: z.string().trim().max(200).optional(), rules: z.array(Rule).min(1) }).strict();

class RuleSetDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['draft', 'published', 'retired'] }) status!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) effectiveFrom!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
}
class RuleSetDetailDto extends RuleSetDto {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '與 @yutis/domain GradingRule 相同格式' }) rules!: unknown[];
}

const TenantAdmin = () => StaffOnly({ feature: 'tenant-admin' });

@ApiTags('admin')
@Controller('admin')
export class ExamSettingsController {
  @Get('exam-mappings') @TenantAdmin() @ApiOperation({ summary: '健檢匯入對照' }) @ApiOkResponse({ type: [ExamMappingDto] })
  async listMappings(@Ctx() ctx: RequestContext): Promise<ExamMappingDto[]> {
    const rows = await ctx.tx.select().from(examImportMappings).orderBy(asc(examImportMappings.clinic));
    return rows.map(r => ({ id: r.id, clinic: r.clinic, mapping: r.mapping as ExamMappingDto['mapping'] }));
  }

  @Post('exam-mappings') @TenantAdmin() @ApiOperation({ summary: '新增健檢醫院的欄位對照' })
  @ApiBody({ schema: openApiSchema(ExamMapping) }) @ApiCreatedResponse({ type: ExamMappingDto })
  async createMapping(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<ExamMappingDto> {
    const { clinic, ...mapping } = parse(ExamMapping, body);
    try {
      const [row] = await ctx.tx.insert(examImportMappings).values({ tenantId: ctx.tenant.id, clinic, mapping, createdBy: staff(ctx).userId }).returning();
      await recordAudit(ctx, { action: 'create', subjectTable: 'exam_import_mappings', subjectId: row!.id });
      return { id: row!.id, clinic, mapping };
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException({ code: 'duplicate', message: `A mapping for ${clinic} already exists` });
      throw error;
    }
  }

  @Get('exam-mappings/:id/template') @TenantAdmin()
  @ApiOperation({ summary: '依健檢匯入對照產生的空白檔（.xlsx）', description: '欄位名稱與這家醫院的對照相同；粗體為必填。可提供給健檢醫院。' })
  @ApiProduces(XLSX_MIME) @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  mappingTemplate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    return sendExamTemplate(ctx, id, reply);
  }

  @Put('exam-mappings/:id') @TenantAdmin() @ApiOperation({ summary: '修改欄位對照' })
  @ApiBody({ schema: openApiSchema(ExamMapping) }) @ApiOkResponse({ type: ExamMappingDto })
  async updateMapping(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ExamMappingDto> {
    const { clinic, ...mapping } = parse(ExamMapping, body);
    const [row] = await ctx.tx.update(examImportMappings).set({ clinic, mapping, updatedAt: new Date(), updatedBy: staff(ctx).userId })
      .where(eq(examImportMappings.id, id)).returning({ id: examImportMappings.id });
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'No such mapping' });
    await recordAudit(ctx, { action: 'update', subjectTable: 'exam_import_mappings', subjectId: id });
    return { id, clinic, mapping };
  }

  @Delete('exam-mappings/:id') @HttpCode(204) @TenantAdmin() @ApiOperation({ summary: '刪除欄位對照' }) @ApiNoContentResponse()
  async deleteMapping(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const [row] = await ctx.tx.delete(examImportMappings).where(eq(examImportMappings.id, id)).returning({ id: examImportMappings.id });
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'No such mapping' });
    await recordAudit(ctx, { action: 'delete', subjectTable: 'exam_import_mappings', subjectId: id });
  }

  @Get('rule-sets') @TenantAdmin() @ApiOperation({ summary: '分級標準版本' }) @ApiOkResponse({ type: [RuleSetDto] })
  listRuleSets(@Ctx() ctx: RequestContext): Promise<RuleSetDto[]> {
    return ctx.tx.select({ id: gradingRuleSets.id, version: gradingRuleSets.version, status: gradingRuleSets.status, effectiveFrom: gradingRuleSets.effectiveFrom, note: gradingRuleSets.note })
      .from(gradingRuleSets).orderBy(desc(gradingRuleSets.version));
  }

  @Get('rule-sets/:id') @TenantAdmin() @ApiOperation({ summary: '某一版分級標準的規則' }) @ApiOkResponse({ type: RuleSetDetailDto })
  async ruleSet(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<RuleSetDetailDto> {
    const [set] = await ctx.tx.select().from(gradingRuleSets).where(eq(gradingRuleSets.id, id));
    if (!set) throw new NotFoundException({ code: 'not_found', message: 'No such rule set' });
    const { rules } = await loadRuleSet(ctx.tx, id);
    return { id, version: set.version, status: set.status, effectiveFrom: set.effectiveFrom, note: set.note, rules };
  }

  @Post('rule-sets') @TenantAdmin()
  @ApiOperation({ summary: '建立新版分級標準（草稿）', description: '送出整套規則；發布前不影響分級。' })
  @ApiBody({ schema: openApiSchema(NewRuleSet) }) @ApiCreatedResponse({ type: RuleSetDto })
  async createRuleSet(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<RuleSetDto> {
    const input = parse(NewRuleSet, body);
    const [{ latest }] = await ctx.tx.select({ latest: sql<number>`coalesce(max(${gradingRuleSets.version}), 0)::int` }).from(gradingRuleSets) as [{ latest: number }];
    const [set] = await ctx.tx.insert(gradingRuleSets)
      .values({ tenantId: ctx.tenant.id, version: latest + 1, status: 'draft', note: input.note ?? null, createdBy: staff(ctx).userId }).returning();
    await ctx.tx.insert(gradingRules).values(input.rules.map(r => ({
      tenantId: ctx.tenant.id, ruleSetId: set!.id, itemCode: r.code, name: r.name, sex: r.sex, unit: r.unit, valueType: r.type, levels: r.levels, source: r.src,
    })));
    await recordAudit(ctx, { action: 'create', subjectTable: 'grading_rule_sets', subjectId: set!.id, reason: `draft v${set!.version}` });
    return { id: set!.id, version: set!.version, status: set!.status, effectiveFrom: set!.effectiveFrom, note: set!.note };
  }

  @Put('rule-sets/:id') @TenantAdmin()
  @ApiOperation({ summary: '修改分級標準草稿', description: '送出整套規則取代原本的；只有草稿能改。' })
  @ApiBody({ schema: openApiSchema(NewRuleSet) }) @ApiOkResponse({ type: RuleSetDto })
  async updateRuleSet(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<RuleSetDto> {
    const input = parse(NewRuleSet, body);
    const set = await draftRuleSet(ctx, id);
    await ctx.tx.delete(gradingRules).where(eq(gradingRules.ruleSetId, id));
    await ctx.tx.insert(gradingRules).values(input.rules.map(r => ({
      tenantId: ctx.tenant.id, ruleSetId: id, itemCode: r.code, name: r.name, sex: r.sex, unit: r.unit, valueType: r.type, levels: r.levels, source: r.src,
    })));
    const [row] = await ctx.tx.update(gradingRuleSets).set({ note: input.note ?? null, updatedAt: new Date(), updatedBy: staff(ctx).userId })
      .where(eq(gradingRuleSets.id, id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'grading_rule_sets', subjectId: id, reason: `draft v${set.version}` });
    return { id, version: row!.version, status: row!.status, effectiveFrom: row!.effectiveFrom, note: row!.note };
  }

  @Delete('rule-sets/:id') @HttpCode(204) @TenantAdmin() @ApiOperation({ summary: '刪除分級標準草稿', description: '只有草稿能刪；已發布或停用的版本永久保留。' })
  @ApiNoContentResponse()
  async deleteRuleSet(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const set = await draftRuleSet(ctx, id);
    await ctx.tx.delete(gradingRules).where(eq(gradingRules.ruleSetId, id));
    await ctx.tx.delete(gradingRuleSets).where(eq(gradingRuleSets.id, id));
    await recordAudit(ctx, { action: 'delete', subjectTable: 'grading_rule_sets', subjectId: id, reason: `draft v${set.version}` });
  }

  @Post('rule-sets/:id/publish') @HttpCode(200) @TenantAdmin()
  @ApiOperation({ summary: '發布分級標準', description: '之後匯入的健檢依此版本分級；先前的結果保留原版本。' })
  @ApiOkResponse({ type: RuleSetDto })
  async publish(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<RuleSetDto> {
    const [set] = await ctx.tx.select().from(gradingRuleSets).where(eq(gradingRuleSets.id, id));
    if (!set) throw new NotFoundException({ code: 'not_found', message: 'No such rule set' });
    if (set.status !== 'draft') throw new ConflictException({ code: 'not_draft', message: `Rule set v${set.version} is ${set.status}` });
    await ctx.tx.update(gradingRuleSets).set({ status: 'retired', updatedAt: new Date() }).where(eq(gradingRuleSets.status, 'published'));
    const [row] = await ctx.tx.update(gradingRuleSets).set({ status: 'published', effectiveFrom: sql`current_date`, updatedAt: new Date(), updatedBy: staff(ctx).userId })
      .where(eq(gradingRuleSets.id, id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'grading_rule_sets', subjectId: id, reason: `publish v${set.version}` });
    return { id, version: row!.version, status: row!.status, effectiveFrom: row!.effectiveFrom, note: row!.note };
  }
}

async function draftRuleSet(ctx: RequestContext, id: string) {
  const [set] = await ctx.tx.select().from(gradingRuleSets).where(eq(gradingRuleSets.id, id));
  if (!set) throw new NotFoundException({ code: 'not_found', message: 'No such rule set' });
  if (set.status !== 'draft') throw new ConflictException({ code: 'not_draft', message: `Rule set v${set.version} is ${set.status}` });
  return set;
}
