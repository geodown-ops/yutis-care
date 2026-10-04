/*
 * Organisation (組織架構): legal entities → sites (廠／院區) → departments, edited one by one or imported from Excel.
 * Tenant admins only. Deleting something still in use (sites with employees, …) is refused.
 */
import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { departments, legalEntities, sites } from '@yutis/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { CreatedDto } from '../core/dto.js';
import { ApiErrorDto } from '../core/errors.js';
import { pgErrorCode } from '../core/pg.js';
import { openApiSchema, parse } from '../core/validation.js';
import { findSheet, ImportIssueDto, isEmail, readSheet, readWorkbook, refuseIfInvalid, XLSX_MIME, type ImportIssue } from './excel.js';

class OrgDepartmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) code!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) managerName!: string | null;
  @ApiProperty({ type: String, nullable: true }) managerEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) managerPhone!: string | null;
}
class OrgSiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ type: [OrgDepartmentDto] }) departments!: OrgDepartmentDto[];
}
class LegalEntityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [OrgSiteDto] }) sites!: OrgSiteDto[];
}
class ImportCountsDto {
  @ApiProperty() create!: number;
  @ApiProperty() update!: number;
  @ApiProperty() unchanged!: number;
}
export class OrgImportReportDto {
  @ApiProperty({ description: '是否已寫入；預覽（未加 commit=true）或有錯誤時為 false' }) committed!: boolean;
  @ApiProperty({ type: [ImportIssueDto], description: '有任何一列錯誤就整份不匯入' }) issues!: ImportIssue[];
  @ApiProperty({ type: ImportCountsDto }) legalEntities!: ImportCountsDto;
  @ApiProperty({ type: ImportCountsDto }) sites!: ImportCountsDto;
  @ApiProperty({ type: ImportCountsDto }) departments!: ImportCountsDto;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
const CreateLegalEntity = z.object({ code: text(40), name: text(100) }).strict();
const UpdateLegalEntity = CreateLegalEntity.partial().strict();
const CreateSite = z.object({ legalEntityId: z.uuid(), code: text(40), name: text(100), address: optionalText(200) }).strict();
const UpdateSite = CreateSite.partial().strict();
const CreateDepartment = z.object({
  siteId: z.uuid(), code: optionalText(40), name: text(100),
  managerName: optionalText(100), managerEmail: z.email().nullable().optional().transform(v => v || null), managerPhone: optionalText(40),
}).strict();
const UpdateDepartment = CreateDepartment.partial().strict();
export const ImportQuery = z.object({ commit: z.enum(['true', 'false']).default('false').transform(v => v === 'true') });

const TenantAdmin = () => StaffOnly({ feature: 'tenant-admin' });
const audited = (ctx: RequestContext, action: AuditEntry['action'], subjectTable: string, subjectId: string) =>
  recordAudit(ctx, { action, subjectTable, subjectId, reason: 'tenant admin' });

/** Unique codes and foreign keys become 409s with a code the frontend can show. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = pgErrorCode(error);
    if (code === '23505') throw new ConflictException({ code: 'duplicate', message: 'Code (or department name within the site) already in use' });
    if (code === '23503') throw new ConflictException({ code: 'in_use', message: 'Still referenced (e.g. by employees, sites or departments), or the parent does not exist' });
    throw error;
  }
}

@ApiTags('admin')
@Controller('admin/org')
export class OrgController {
  @Get()
  @TenantAdmin()
  @ApiOperation({ summary: '組織架構（法人 → 廠區 → 部門）' })
  @ApiOkResponse({ type: [LegalEntityDto] })
  async tree(@Ctx() ctx: RequestContext): Promise<LegalEntityDto[]> {
    const les = await ctx.tx.select().from(legalEntities).orderBy(asc(legalEntities.code));
    const ss = await ctx.tx.select().from(sites).orderBy(asc(sites.code));
    const ds = await ctx.tx.select().from(departments).orderBy(asc(departments.name));
    return les.map(le => ({
      id: le.id, code: le.code, name: le.name,
      sites: ss.filter(s => s.legalEntityId === le.id).map(s => ({
        id: s.id, code: s.code, name: s.name, address: s.address,
        departments: ds.filter(d => d.siteId === s.id).map(d => ({
          id: d.id, code: d.code, name: d.name, managerName: d.managerName, managerEmail: d.managerEmail, managerPhone: d.managerPhone,
        })),
      })),
    }));
  }

  @Post('legal-entities') @TenantAdmin() @ApiOperation({ summary: '新增法人' })
  @ApiBody({ schema: openApiSchema(CreateLegalEntity) }) @ApiCreatedResponse({ type: CreatedDto }) @ApiConflictResponse({ type: ApiErrorDto })
  createLegalEntity(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(CreateLegalEntity, body);
    return guarded(async () => {
      const [row] = await ctx.tx.insert(legalEntities).values({ ...input, tenantId: ctx.tenant.id, createdBy: actor(ctx) }).returning({ id: legalEntities.id });
      await audited(ctx, 'create', 'legal_entities', row!.id);
      return row!;
    });
  }

  @Patch('legal-entities/:id') @TenantAdmin() @ApiOperation({ summary: '修改法人' })
  @ApiBody({ schema: openApiSchema(UpdateLegalEntity) }) @ApiOkResponse({ type: CreatedDto }) @ApiConflictResponse({ type: ApiErrorDto })
  updateLegalEntity(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(UpdateLegalEntity, body);
    return guarded(async () => {
      const [row] = await ctx.tx.update(legalEntities).set({ ...input, updatedAt: new Date(), updatedBy: actor(ctx) }).where(eq(legalEntities.id, id)).returning({ id: legalEntities.id });
      if (!row) throw notFound();
      await audited(ctx, 'update', 'legal_entities', id);
      return row;
    });
  }

  @Delete('legal-entities/:id') @HttpCode(204) @TenantAdmin() @ApiOperation({ summary: '刪除法人（沒有廠區與員工時）' })
  @ApiNoContentResponse() @ApiConflictResponse({ type: ApiErrorDto })
  deleteLegalEntity(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return guarded(async () => {
      const [row] = await ctx.tx.delete(legalEntities).where(eq(legalEntities.id, id)).returning({ id: legalEntities.id });
      if (!row) throw notFound();
      await audited(ctx, 'delete', 'legal_entities', id);
    });
  }

  @Post('sites') @TenantAdmin() @ApiOperation({ summary: '新增廠區' })
  @ApiBody({ schema: openApiSchema(CreateSite) }) @ApiCreatedResponse({ type: CreatedDto }) @ApiConflictResponse({ type: ApiErrorDto })
  createSite(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(CreateSite, body);
    return guarded(async () => {
      const [row] = await ctx.tx.insert(sites).values({ ...input, tenantId: ctx.tenant.id, createdBy: actor(ctx) }).returning({ id: sites.id });
      await audited(ctx, 'create', 'sites', row!.id);
      return row!;
    });
  }

  @Patch('sites/:id') @TenantAdmin() @ApiOperation({ summary: '修改廠區' })
  @ApiBody({ schema: openApiSchema(UpdateSite) }) @ApiOkResponse({ type: CreatedDto }) @ApiConflictResponse({ type: ApiErrorDto })
  updateSite(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(UpdateSite, body);
    return guarded(async () => {
      const [row] = await ctx.tx.update(sites).set({ ...input, updatedAt: new Date(), updatedBy: actor(ctx) }).where(eq(sites.id, id)).returning({ id: sites.id });
      if (!row) throw notFound();
      await audited(ctx, 'update', 'sites', id);
      return row;
    });
  }

  @Delete('sites/:id') @HttpCode(204) @TenantAdmin() @ApiOperation({ summary: '刪除廠區（沒有部門、員工與負責人員時）' })
  @ApiNoContentResponse() @ApiConflictResponse({ type: ApiErrorDto })
  deleteSite(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return guarded(async () => {
      const [row] = await ctx.tx.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id });
      if (!row) throw notFound();
      await audited(ctx, 'delete', 'sites', id);
    });
  }

  @Post('departments') @TenantAdmin() @ApiOperation({ summary: '新增部門' })
  @ApiBody({ schema: openApiSchema(CreateDepartment) }) @ApiCreatedResponse({ type: CreatedDto }) @ApiConflictResponse({ type: ApiErrorDto })
  createDepartment(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(CreateDepartment, body);
    return guarded(async () => {
      const [row] = await ctx.tx.insert(departments).values({ ...input, tenantId: ctx.tenant.id, createdBy: actor(ctx) }).returning({ id: departments.id });
      await audited(ctx, 'create', 'departments', row!.id);
      return row!;
    });
  }

  @Patch('departments/:id') @TenantAdmin() @ApiOperation({ summary: '修改部門' })
  @ApiBody({ schema: openApiSchema(UpdateDepartment) }) @ApiOkResponse({ type: CreatedDto }) @ApiConflictResponse({ type: ApiErrorDto })
  updateDepartment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(UpdateDepartment, body);
    return guarded(async () => {
      const [row] = await ctx.tx.update(departments).set({ ...input, updatedAt: new Date(), updatedBy: actor(ctx) }).where(eq(departments.id, id)).returning({ id: departments.id });
      if (!row) throw notFound();
      await audited(ctx, 'update', 'departments', id);
      return row;
    });
  }

  @Delete('departments/:id') @HttpCode(204) @TenantAdmin() @ApiOperation({ summary: '刪除部門（沒有員工時）' })
  @ApiNoContentResponse() @ApiConflictResponse({ type: ApiErrorDto })
  deleteDepartment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return guarded(async () => {
      const [row] = await ctx.tx.delete(departments).where(eq(departments.id, id)).returning({ id: departments.id });
      if (!row) throw notFound();
      await audited(ctx, 'delete', 'departments', id);
    });
  }

  @Post('import')
  @HttpCode(200)
  @TenantAdmin()
  @ApiOperation({
    summary: '以 Excel 匯入組織',
    description: '工作表「法人」（代碼、名稱）、「廠區」（代碼、名稱、法人代碼、地址）、「部門」（廠區代碼、名稱、代碼、主管姓名、主管Email、主管電話）。'
      + '依代碼（部門依廠區＋名稱）新增或更新，不刪除。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。',
  })
  @ApiConsumes(XLSX_MIME)
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'commit', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: OrgImportReportDto })
  @ApiUnprocessableEntityResponse({ description: '檔案有錯誤（import_invalid），未寫入；report 內有錯誤列', type: ApiErrorDto })
  async import(@Ctx() ctx: RequestContext, @Body() body: unknown, @Query() query: unknown): Promise<OrgImportReportDto> {
    const { commit } = parse(ImportQuery, query);
    const report = await importOrg(ctx, await readWorkbook(body), commit);
    refuseIfInvalid(report, !commit);
    return report;
  }
}

const notFound = () => new NotFoundException({ code: 'not_found', message: 'No such organisation unit' });
const actor = (ctx: RequestContext) => (ctx.principal?.kind === 'staff' ? ctx.principal.userId : null);

async function importOrg(ctx: RequestContext, workbook: Awaited<ReturnType<typeof readWorkbook>>, commit: boolean): Promise<OrgImportReportDto> {
  const issues: ImportIssue[] = [];
  const sheetRows = (name: string, required: string[]) => {
    const sheet = findSheet(workbook, name);
    if (!sheet) return [];
    const { rows, issues: headerIssues } = readSheet(sheet, required);
    issues.push(...headerIssues);
    return rows;
  };
  const leRows = sheetRows('法人', ['代碼', '名稱']);
  const siteRows = sheetRows('廠區', ['代碼', '名稱', '法人代碼']);
  const deptRows = sheetRows('部門', ['廠區代碼', '名稱']);
  if (!findSheet(workbook, '法人') && !findSheet(workbook, '廠區') && !findSheet(workbook, '部門')) {
    issues.push({ row: 1, message: '找不到「法人」、「廠區」或「部門」工作表' });
  }

  const existingLes = await ctx.tx.select().from(legalEntities);
  const existingSites = await ctx.tx.select().from(sites);
  const existingDepts = await ctx.tx.select().from(departments);
  const add = (sheet: string, row: number, column: string | undefined, message: string) => issues.push({ sheet, row, ...(column ? { column } : {}), message });
  const required = (sheet: string, r: { row: number; values: Record<string, string> }, cols: string[]) =>
    cols.filter(c => !r.values[c]).forEach(c => add(sheet, r.row, c, '必填'));

  const leCodes = new Set<string>();
  for (const r of leRows) {
    required('法人', r, ['代碼', '名稱']);
    if (r.values['代碼'] && leCodes.has(r.values['代碼'])) add('法人', r.row, '代碼', '代碼重複');
    leCodes.add(r.values['代碼']!);
  }
  const knownLe = (code: string) => leCodes.has(code) || existingLes.some(l => l.code === code);
  const siteCodes = new Set<string>();
  for (const r of siteRows) {
    required('廠區', r, ['代碼', '名稱', '法人代碼']);
    if (r.values['代碼'] && siteCodes.has(r.values['代碼'])) add('廠區', r.row, '代碼', '代碼重複');
    if (r.values['法人代碼'] && !knownLe(r.values['法人代碼'])) add('廠區', r.row, '法人代碼', `找不到法人 ${r.values['法人代碼']}`);
    siteCodes.add(r.values['代碼']!);
  }
  const knownSite = (code: string) => siteCodes.has(code) || existingSites.some(s => s.code === code);
  const deptKeys = new Set<string>();
  for (const r of deptRows) {
    required('部門', r, ['廠區代碼', '名稱']);
    const key = `${r.values['廠區代碼']}/${r.values['名稱']}`;
    if (r.values['名稱'] && deptKeys.has(key)) add('部門', r.row, '名稱', '同一廠區的部門名稱重複');
    deptKeys.add(key);
    if (r.values['廠區代碼'] && !knownSite(r.values['廠區代碼'])) add('部門', r.row, '廠區代碼', `找不到廠區 ${r.values['廠區代碼']}`);
    if (r.values['主管Email'] && !isEmail(r.values['主管Email'])) add('部門', r.row, '主管Email', 'Email 格式錯誤');
  }

  const counts = () => ({ create: 0, update: 0, unchanged: 0 });
  const report: OrgImportReportDto = { committed: false, issues, legalEntities: counts(), sites: counts(), departments: counts() };
  const opt = (v: string | undefined) => v || null;

  // Plan (and, when committing, apply) in dependency order, so ids of new parents are known.
  const write = commit && !issues.length;
  const audits: AuditEntry[] = [];
  const leIdByCode = new Map(existingLes.map(l => [l.code, l.id]));
  for (const r of leRows) {
    const v = { code: r.values['代碼']!, name: r.values['名稱']! };
    const cur = existingLes.find(l => l.code === v.code);
    if (cur && cur.name === v.name) { report.legalEntities.unchanged++; continue; }
    report.legalEntities[cur ? 'update' : 'create']++;
    if (!write) continue;
    if (cur) await ctx.tx.update(legalEntities).set({ name: v.name, updatedAt: new Date(), updatedBy: actor(ctx) }).where(eq(legalEntities.id, cur.id));
    else leIdByCode.set(v.code, (await ctx.tx.insert(legalEntities).values({ ...v, tenantId: ctx.tenant.id, createdBy: actor(ctx) }).returning({ id: legalEntities.id }))[0]!.id);
    audits.push({ action: cur ? 'update' : 'create', subjectTable: 'legal_entities', subjectId: leIdByCode.get(v.code)!, reason: 'organisation import' });
  }
  const siteIdByCode = new Map(existingSites.map(s => [s.code, s.id]));
  for (const r of siteRows) {
    const v = { code: r.values['代碼']!, name: r.values['名稱']!, address: opt(r.values['地址']) };
    const leId = leIdByCode.get(r.values['法人代碼']!) ?? '';
    const cur = existingSites.find(s => s.code === v.code);
    if (cur && cur.name === v.name && cur.address === v.address && existingLes.find(l => l.id === cur.legalEntityId)?.code === r.values['法人代碼']) {
      report.sites.unchanged++;
      continue;
    }
    report.sites[cur ? 'update' : 'create']++;
    if (!write) continue;
    if (cur) await ctx.tx.update(sites).set({ ...v, legalEntityId: leId, updatedAt: new Date(), updatedBy: actor(ctx) }).where(eq(sites.id, cur.id));
    else siteIdByCode.set(v.code, (await ctx.tx.insert(sites).values({ ...v, legalEntityId: leId, tenantId: ctx.tenant.id, createdBy: actor(ctx) }).returning({ id: sites.id }))[0]!.id);
    audits.push({ action: cur ? 'update' : 'create', subjectTable: 'sites', subjectId: siteIdByCode.get(v.code)!, reason: 'organisation import' });
  }
  for (const r of deptRows) {
    const siteCode = r.values['廠區代碼']!;
    const v = {
      name: r.values['名稱']!, code: opt(r.values['代碼']), managerName: opt(r.values['主管姓名']),
      managerEmail: opt(r.values['主管Email']), managerPhone: opt(r.values['主管電話']),
    };
    const existingSiteId = existingSites.find(s => s.code === siteCode)?.id;
    const cur = existingSiteId ? existingDepts.find(d => d.siteId === existingSiteId && d.name === v.name) : undefined;
    if (cur && cur.code === v.code && cur.managerName === v.managerName && cur.managerEmail === v.managerEmail && cur.managerPhone === v.managerPhone) {
      report.departments.unchanged++;
      continue;
    }
    report.departments[cur ? 'update' : 'create']++;
    if (!write) continue;
    let id = cur?.id;
    if (cur) await ctx.tx.update(departments).set({ ...v, updatedAt: new Date(), updatedBy: actor(ctx) }).where(eq(departments.id, cur.id));
    else id = (await ctx.tx.insert(departments).values({ ...v, siteId: siteIdByCode.get(siteCode)!, tenantId: ctx.tenant.id, createdBy: actor(ctx) }).returning({ id: departments.id }))[0]!.id;
    audits.push({ action: cur ? 'update' : 'create', subjectTable: 'departments', subjectId: id!, reason: 'organisation import' });
  }
  if (write) {
    if (audits.length) await recordAudit(ctx, audits);
    report.committed = true;
  }
  return report;
}
