/*
 * Employee master import (員工匯入): an Excel sheet, validated first, then created or updated by 工號 (emp_no).
 * Exceeding the subscription's seat limit only warns; it never blocks an import. After a committed import the
 * month's `active_employees` usage counter is set to the number of current employees. National ID numbers (身分證字號)
 * are never stored in full: only a per-tenant keyed fingerprint, used to match clinic files, and a masked form for display.
 * Admins can also list the master and add or change one employee at a time (員工主檔), with the same rules.
 */
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiProperty, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { currentSubscriptionFirst, departments, employees, legalEntities, sites, tenantSubscriptions, usageCounters } from '@yutis/db';
import { EMPLOYEE_LANGS, isEmployeeLang } from '@yutis/domain';
import { and, asc, count, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { ApiErrorDto } from '../core/errors.js';
import { pgErrorCode } from '../core/pg.js';
import { openApiSchema, parse } from '../core/validation.js';
import { ImportIssueDto, isEmail, isIsoDate, readSheet, readWorkbook, refuseIfInvalid, sendXlsx, templateWorkbook, XLSX_MIME, type ImportIssue } from './excel.js';
import { ImportQuery } from './org.controller.js';
import { contains } from '../employees/employees.controller.js';
import { raiseAgeEvents } from '../programs/common.js';

export const EMPLOYEE_COLUMNS = {
  required: ['工號', '姓名', '性別', '出生日期', '法人代碼', '廠區代碼', '部門'],
  optional: ['身分證字號', '職稱', '班別', '健檢類別', '特殊作業', '語言', '到職日', 'Email', '手機', '狀態'],
} as const;
const STATUSES = ['在職', '留停', '離職'] as const;
/** Taiwan national ID or resident certificate number: a letter, then 1/2 (or 8/9, A–D for residents), then 8 digits. */
const NATIONAL_ID = /^[A-Z][12890ABCD]\d{8}$/;

/** What staff see of a national ID: the first two and last three characters, e.g. A123456789 → A1•••••789. */
export const maskNationalId = (id: string) => `${id.slice(0, 2)}${'•'.repeat(id.length - 5)}${id.slice(-3)}`;

class SeatsDto {
  @ApiProperty({ description: '匯入後的在職員工數' }) activeEmployees!: number;
  @ApiProperty({ type: Number, nullable: true, description: '訂閱的人數上限' }) seatLimit!: number | null;
  @ApiProperty({ description: '超過人數上限（只提醒，不阻擋匯入）' }) overLimit!: boolean;
}

class EmployeeImportReportDto {
  @ApiProperty({ description: '是否已寫入；預覽（未加 commit=true）或有錯誤時為 false' }) committed!: boolean;
  @ApiProperty({ description: '資料列數' }) rows!: number;
  @ApiProperty() create!: number;
  @ApiProperty() update!: number;
  @ApiProperty() unchanged!: number;
  @ApiProperty({ type: [ImportIssueDto], description: '有任何一列錯誤就整份不匯入' }) issues!: ImportIssue[];
  @ApiProperty({ type: SeatsDto }) seats!: SeatsDto;
}

class EmployeeNameDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: STATUSES, description: '離職員工也會列出' }) status!: (typeof STATUSES)[number];
}
const EmployeeSearch = z.object({
  q: z.string().trim().max(50).default(''),
  /** Comma-separated, or the parameter repeated. */
  ids: z.preprocess(v => (Array.isArray(v) ? v.join(',') : v), z.string().default(''))
    .transform(v => v.split(',').map(id => id.trim()).filter(Boolean)).pipe(z.array(z.uuid()).max(50)),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

class EmployeeRecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: '工號' }) empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['男', '女'] }) sex!: '男' | '女';
  @ApiProperty({ format: 'date' }) birthDate!: string;
  @ApiProperty({ format: 'uuid' }) legalEntityId!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ format: 'uuid' }) departmentId!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) shift!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '健檢類別' }) examCategory!: string | null;
  @ApiProperty({ type: [String] }) specialOperations!: string[];
  @ApiProperty({ enum: EMPLOYEE_LANGS, description: '員工端語言' }) lang!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) hireDate!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ enum: STATUSES }) status!: (typeof STATUSES)[number];
  @ApiProperty({ type: String, nullable: true, description: '遮罩後的身分證字號；系統不存完整號碼' }) nationalIdMasked!: string | null;
}

class EmployeeRecordPageDto {
  @ApiProperty({ description: '符合條件的總人數' }) total!: number;
  @ApiProperty({ type: [EmployeeRecordDto] }) items!: EmployeeRecordDto[];
}

const RecordQuery = z.object({
  q: z.string().trim().max(50).optional(),
  siteId: z.uuid().optional(),
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const isoDate = z.string().refine(isIsoDate, '日期格式應為 YYYY-MM-DD');
const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable();
/** One employee, as the admin types it; the same rules as a row of the import sheet. 法人 follows from the 廠區. */
const EmployeeFields = z.object({
  empNo: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  sex: z.enum(['男', '女']),
  birthDate: isoDate,
  siteId: z.uuid(),
  departmentId: z.uuid(),
  title: optionalText(100),
  shift: optionalText(50),
  examCategory: optionalText(50),
  specialOperations: z.array(z.string().trim().min(1).max(50)).max(30),
  lang: z.string().refine(isEmployeeLang, `應為 ${EMPLOYEE_LANGS.join('、')} 之一`),
  hireDate: isoDate.nullable(),
  email: z.string().trim().toLowerCase().max(200).refine(v => !v || isEmail(v), 'Email 格式錯誤').transform(v => v || null).nullable(),
  phone: optionalText(40),
  status: z.enum(STATUSES),
  /** The full number, only to fingerprint and mask it; null removes it. Never stored or returned. */
  nationalId: z.string().trim().toUpperCase().refine(v => !v || NATIONAL_ID.test(v), '身分證字號格式錯誤').transform(v => v || null).nullable(),
});
const CreateEmployee = EmployeeFields.partial({
  title: true, shift: true, examCategory: true, specialOperations: true, lang: true, hireDate: true, email: true, phone: true, status: true, nationalId: true,
}).strict();
const UpdateEmployee = EmployeeFields.partial().strict();

type EmployeeValues = Omit<typeof employees.$inferInsert, 'id' | 'tenantId' | 'empNo' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'nationalIdHash' | 'nationalIdMasked'>;
const COMPARED: (keyof EmployeeValues)[] = [
  'name', 'sex', 'birthDate', 'legalEntityId', 'siteId', 'departmentId', 'title', 'shift', 'examCategory', 'specialOperations', 'lang', 'hireDate', 'email', 'phone', 'status',
];

@ApiTags('admin')
@Controller('admin/employees')
export class EmployeesController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Get()
  @StaffOnly({ feature: 'tenant-admin', data: 'identity' })
  @ApiOperation({
    summary: '找員工（租戶管理員）',
    description: '依姓名或工號找員工，或用 ids 查指定的員工；只回傳 id、工號、姓名與在職狀態，供稽核查詢選員工用；含離職員工。回傳的每位員工都記入稽核。',
  })
  @ApiQuery({ name: 'q', required: false, type: String, description: '姓名或工號的一部分' })
  @ApiQuery({ name: 'ids', required: false, type: String, description: '員工 id，以逗號分隔（最多 50 個）；有給時不受 limit 限制' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '最多幾筆（1–50，預設 20）' })
  @ApiOkResponse({ type: [EmployeeNameDto] })
  async search(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<EmployeeNameDto[]> {
    const { q, ids, limit } = parse(EmployeeSearch, query);
    const like = contains(q);
    const rows = await ctx.tx.select({ id: employees.id, empNo: employees.empNo, name: employees.name, status: employees.status }).from(employees)
      .where(and(q ? or(ilike(employees.name, like), ilike(employees.empNo, like)) : undefined, ids.length ? inArray(employees.id, ids) : undefined))
      .orderBy(asc(employees.empNo)).limit(ids.length ? ids.length : limit);
    if (rows.length) {
      await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'employees', subjectId: r.id, employeeId: r.id, dataCategory: 'identity', reason: 'admin employee search' })));
    }
    return rows;
  }

  @Get('records')
  @StaffOnly({ feature: 'tenant-admin', data: 'identity' })
  @ApiOperation({ summary: '員工主檔（租戶管理員）', description: '所有廠區的員工主檔，依工號排序；q 比對姓名或工號。每位列出的員工都記入稽核。' })
  @ApiQuery({ name: 'q', required: false, type: String, description: '姓名或工號的一部分' })
  @ApiQuery({ name: 'siteId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: STATUSES })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每頁筆數，預設 50，最多 200' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '略過的筆數，預設 0' })
  @ApiOkResponse({ type: EmployeeRecordPageDto })
  async records(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<EmployeeRecordPageDto> {
    const q = parse(RecordQuery, query);
    const where: SQL[] = [];
    if (q.siteId) where.push(eq(employees.siteId, q.siteId));
    if (q.status) where.push(eq(employees.status, q.status));
    if (q.q) where.push(or(ilike(employees.name, contains(q.q)), ilike(employees.empNo, contains(q.q)))!);
    const [{ total }] = await ctx.tx.select({ total: count() }).from(employees).where(and(...where)) as [{ total: number }];
    const rows = await ctx.tx.select().from(employees).where(and(...where)).orderBy(asc(employees.empNo)).limit(q.limit).offset(q.offset);
    if (rows.length) {
      await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'employees', subjectId: r.id, employeeId: r.id, dataCategory: 'identity', reason: 'admin employee master' })));
    }
    return { total, items: rows.map(toRecord) };
  }

  @Post()
  @StaffOnly({ feature: 'tenant-admin', data: 'identity' })
  @ApiOperation({ summary: '新增一位員工', description: '與匯入相同的規則；法人依廠區決定，部門需屬於該廠區。超過人數上限不阻擋。' })
  @ApiBody({ schema: openApiSchema(CreateEmployee) })
  @ApiCreatedResponse({ type: EmployeeRecordDto })
  @ApiConflictResponse({ description: '工號已存在（emp_no_taken）或身分證字號已屬於其他員工（national_id_taken）', type: ApiErrorDto })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<EmployeeRecordDto> {
    const input = parse(CreateEmployee, body);
    const org = await this.placement(ctx, input.siteId, input.departmentId);
    const nationalId = await this.nationalId(ctx, input.nationalId ?? null);
    await this.assertUnique(ctx, input.empNo, nationalId?.nationalIdHash);
    const created = await this.write(ctx, () => ctx.tx.insert(employees).values({
      tenantId: ctx.tenant.id, empNo: input.empNo, name: input.name, sex: input.sex, birthDate: input.birthDate, ...org,
      title: input.title ?? null, shift: input.shift ?? null, examCategory: input.examCategory ?? null, specialOperations: input.specialOperations ?? [],
      lang: input.lang ?? 'zh', hireDate: input.hireDate ?? null, email: input.email ?? null, phone: input.phone ?? null, status: input.status ?? '在職',
      ...(nationalId ?? {}), createdBy: staff(ctx).userId,
    }).returning());
    await recordAudit(ctx, { action: 'create', subjectTable: 'employees', subjectId: created.id, employeeId: created.id, dataCategory: 'identity', reason: 'employee added by hand' });
    await afterEmployeeChange(ctx, [created.id]);
    return toRecord(created);
  }

  @Patch(':id')
  @StaffOnly({ feature: 'tenant-admin', data: 'identity' })
  @ApiOperation({ summary: '修改一位員工', description: '只改有給的欄位；換廠區時要一起給部門。nationalId 給 null 會移除身分證字號。' })
  @ApiBody({ schema: openApiSchema(UpdateEmployee) })
  @ApiOkResponse({ type: EmployeeRecordDto })
  @ApiConflictResponse({ description: '工號已存在（emp_no_taken）或身分證字號已屬於其他員工（national_id_taken）', type: ApiErrorDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<EmployeeRecordDto> {
    const input = parse(UpdateEmployee, body);
    const [current] = await ctx.tx.select().from(employees).where(eq(employees.id, id));
    if (!current) throw new NotFoundException({ code: 'employee_not_found', message: 'No such employee' });
    const { siteId, departmentId, nationalId: rawId, ...fields } = input;
    const org = siteId || departmentId ? await this.placement(ctx, siteId ?? current.siteId, departmentId ?? current.departmentId) : {};
    const nationalId = rawId === undefined ? {} : (await this.nationalId(ctx, rawId)) ?? { nationalIdHash: null, nationalIdMasked: null };
    await this.assertUnique(ctx, input.empNo, 'nationalIdHash' in nationalId ? nationalId.nationalIdHash : undefined, id);
    const updated = await this.write(ctx, () => ctx.tx.update(employees)
      .set({ ...fields, ...org, ...nationalId, updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(employees.id, id)).returning());
    const changed = Object.keys(input).map(k => (k === 'nationalId' ? '身分證字號' : k)).join(', ');
    await recordAudit(ctx, { action: 'update', subjectTable: 'employees', subjectId: id, employeeId: id, dataCategory: 'identity', reason: `changed ${changed}` });
    await afterEmployeeChange(ctx, [id]);
    return toRecord(updated);
  }

  /** The legal entity of a site, after checking the department belongs to it. */
  private async placement(ctx: RequestContext, siteId: string, departmentId: string) {
    const [site] = await ctx.tx.select({ legalEntityId: sites.legalEntityId }).from(sites).where(eq(sites.id, siteId));
    if (!site) throw new BadRequestException({ code: 'unknown_site', message: 'No such site' });
    const [dept] = await ctx.tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.siteId, siteId)));
    if (!dept) throw new BadRequestException({ code: 'unknown_department', message: 'The department is not in this site' });
    return { legalEntityId: site.legalEntityId, siteId, departmentId };
  }

  private async nationalId(ctx: RequestContext, id: string | null) {
    if (!id) return null;
    return { nationalIdHash: await this.crypto.fingerprint(ctx.tenant.id, id), nationalIdMasked: maskNationalId(id) };
  }

  private async assertUnique(ctx: RequestContext, empNo: string | undefined, nationalIdHash: string | null | undefined, self?: string) {
    const others = self ? ne(employees.id, self) : undefined;
    if (empNo && (await ctx.tx.select({ id: employees.id }).from(employees).where(and(eq(employees.empNo, empNo), others))).length) {
      throw new ConflictException({ code: 'emp_no_taken', message: `工號 ${empNo} 已有員工` });
    }
    if (nationalIdHash) {
      const [owner] = await ctx.tx.select({ empNo: employees.empNo }).from(employees).where(and(eq(employees.nationalIdHash, nationalIdHash), others));
      if (owner) throw new ConflictException({ code: 'national_id_taken', message: `身分證字號已屬於工號 ${owner.empNo}` });
    }
  }

  /** Runs an insert or update, turning a unique-key race into the same 409 the checks give. */
  private async write(ctx: RequestContext, run: () => Promise<(typeof employees.$inferSelect)[]>): Promise<typeof employees.$inferSelect> {
    try {
      const [row] = await run();
      return row!;
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException({ code: 'emp_no_taken', message: '工號或身分證字號已有員工' });
      throw error;
    }
  }

  @Get('import-template')
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({ summary: '員工主檔匯入範本（.xlsx）', description: '只有欄位名稱；粗體為必填。' })
  @ApiProduces(XLSX_MIME)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template(@Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    return sendXlsx(reply, '員工主檔匯入範本.xlsx', await templateWorkbook([{ name: '員工', ...EMPLOYEE_COLUMNS }]));
  }

  @Post('import')
  @HttpCode(200)
  @StaffOnly({ feature: 'tenant-admin', data: 'identity' })
  @ApiOperation({
    summary: '以 Excel 匯入員工主檔',
    description: `第一個工作表，第一列為欄位名稱。必填：${EMPLOYEE_COLUMNS.required.join('、')}；選填：${EMPLOYEE_COLUMNS.optional.join('、')}。`
      + '依工號新增或更新（檔案裡沒有的員工不會被刪除；離職請填狀態）。語言留空時保留員工在員工端自己設定的語言（新員工為 zh）。組織需先建立。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。超過人數上限只提醒。',
  })
  @ApiConsumes(XLSX_MIME)
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'commit', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: EmployeeImportReportDto })
  @ApiUnprocessableEntityResponse({ description: '檔案有錯誤（import_invalid），未寫入；report 內有錯誤列', type: ApiErrorDto })
  async import(@Ctx() ctx: RequestContext, @Body() body: unknown, @Query() query: unknown): Promise<EmployeeImportReportDto> {
    const { commit } = parse(ImportQuery, query);
    const workbook = await readWorkbook(body);
    const sheet = workbook.worksheets[0];
    const issues: ImportIssue[] = [];
    const { rows, issues: headerIssues } = sheet ? readSheet(sheet, EMPLOYEE_COLUMNS.required) : { rows: [], issues: [{ row: 1, message: '檔案沒有工作表' }] };
    issues.push(...headerIssues);
    const add = (row: number, column: string, message: string) => issues.push({ row, column, message });

    const les = await ctx.tx.select({ id: legalEntities.id, code: legalEntities.code }).from(legalEntities);
    const ss = await ctx.tx.select({ id: sites.id, code: sites.code, legalEntityId: sites.legalEntityId }).from(sites);
    const ds = await ctx.tx.select({ id: departments.id, siteId: departments.siteId, name: departments.name }).from(departments);
    const existing = new Map((await ctx.tx.select().from(employees)).map(e => [e.empNo, e]));

    const seen = new Set<string>();
    const seenIds = new Map<string, string>();
    const empNoByIdHash = new Map([...existing.values()].filter(e => e.nationalIdHash).map(e => [e.nationalIdHash!, e.empNo]));
    const parsed: { row: number; empNo: string; values: EmployeeValues; nationalId?: { hash: string; masked: string } }[] = [];
    for (const { row, values: v } of rows) {
      const before = issues.length;
      for (const c of EMPLOYEE_COLUMNS.required) if (!v[c]) add(row, c, '必填');
      if (v['工號'] && seen.has(v['工號'])) add(row, '工號', '工號在檔案中重複');
      seen.add(v['工號'] ?? '');
      if (v['性別'] && v['性別'] !== '男' && v['性別'] !== '女') add(row, '性別', '應為「男」或「女」');
      for (const c of ['出生日期', '到職日']) if (v[c] && !isIsoDate(v[c]!)) add(row, c, '日期格式應為 YYYY-MM-DD');
      if (v['Email'] && !isEmail(v['Email'])) add(row, 'Email', 'Email 格式錯誤');
      if (v['語言'] && !isEmployeeLang(v['語言'])) add(row, '語言', `應為 ${EMPLOYEE_LANGS.join('、')} 之一`);
      if (v['狀態'] && !(STATUSES as readonly string[]).includes(v['狀態'])) add(row, '狀態', `應為 ${STATUSES.join('、')} 之一`);
      let nationalIdHash: string | undefined;
      const nationalId = v['身分證字號']?.toUpperCase();
      if (nationalId) {
        if (!NATIONAL_ID.test(nationalId)) add(row, '身分證字號', '格式錯誤');
        else {
          nationalIdHash = await this.crypto.fingerprint(ctx.tenant.id, nationalId);
          if (seenIds.has(nationalIdHash)) add(row, '身分證字號', `與工號 ${seenIds.get(nationalIdHash)} 重複`);
          const owner = empNoByIdHash.get(nationalIdHash);
          if (owner && owner !== v['工號']) add(row, '身分證字號', `已屬於工號 ${owner}`);
          seenIds.set(nationalIdHash, v['工號'] ?? '');
        }
      }
      const le = les.find(l => l.code === v['法人代碼']);
      if (v['法人代碼'] && !le) add(row, '法人代碼', `找不到法人 ${v['法人代碼']}，請先建立組織`);
      const site = ss.find(s => s.code === v['廠區代碼']);
      if (v['廠區代碼'] && !site) add(row, '廠區代碼', `找不到廠區 ${v['廠區代碼']}，請先建立組織`);
      if (site && le && site.legalEntityId !== le.id) add(row, '廠區代碼', `廠區 ${site.code} 不屬於法人 ${le.code}`);
      const dept = site && ds.find(d => d.siteId === site.id && d.name === v['部門']);
      if (site && v['部門'] && !dept) add(row, '部門', `廠區 ${site.code} 沒有部門「${v['部門']}」`);
      if (issues.length > before || !le || !site || !dept) continue;
      parsed.push({
        row, empNo: v['工號']!, ...(nationalIdHash ? { nationalId: { hash: nationalIdHash, masked: maskNationalId(nationalId!) } } : {}),
        values: {
          name: v['姓名']!, sex: v['性別'] as '男' | '女', birthDate: v['出生日期']!, legalEntityId: le.id, siteId: site.id, departmentId: dept.id,
          title: v['職稱'] || null, shift: v['班別'] || null, examCategory: v['健檢類別'] || null,
          specialOperations: (v['特殊作業'] ?? '').split(/[、,，;；]/).map(s => s.trim()).filter(Boolean),
          // Blank keeps the language the employee chose in the portal (new employees get the default, zh).
          lang: v['語言'] || undefined, hireDate: v['到職日'] || null, email: v['Email']?.toLowerCase() || null, phone: v['手機'] || null,
          status: (v['狀態'] || '在職') as (typeof STATUSES)[number],
        },
      });
    }

    const toCreate = parsed.filter(p => !existing.has(p.empNo));
    const toUpdate = parsed.filter(p => {
      const cur = existing.get(p.empNo);
      return cur && (COMPARED.some(k => p.values[k] !== undefined && JSON.stringify(cur[k] ?? null) !== JSON.stringify(p.values[k] ?? null))
        || (p.nationalId !== undefined && (p.nationalId.hash !== cur.nationalIdHash || p.nationalId.masked !== cur.nationalIdMasked)));
    });
    const report: EmployeeImportReportDto = {
      committed: false, rows: rows.length, create: toCreate.length, update: toUpdate.length,
      unchanged: parsed.length - toCreate.length - toUpdate.length, issues, seats: { activeEmployees: 0, seatLimit: null, overLimit: false },
    };

    const projectedActive = () => {
      const status = new Map([...existing.values()].map(e => [e.empNo, e.status as string]));
      for (const p of parsed) status.set(p.empNo, p.values.status!);
      return [...status.values()].filter(s => s === '在職').length;
    };
    refuseIfInvalid(report, !commit);

    if (commit) {
      const me = staff(ctx).userId;
      const audits: AuditEntry[] = [];
      for (let i = 0; i < toCreate.length; i += 500) {
        const created = await ctx.tx.insert(employees)
          .values(toCreate.slice(i, i + 500).map(p => ({
            ...p.values, empNo: p.empNo, nationalIdHash: p.nationalId?.hash ?? null, nationalIdMasked: p.nationalId?.masked ?? null, tenantId: ctx.tenant.id, createdBy: me,
          })))
          .returning({ id: employees.id });
        audits.push(...created.map(c => ({ action: 'create' as const, subjectTable: 'employees', subjectId: c.id, employeeId: c.id, dataCategory: 'identity' as const, reason: 'employee import' })));
      }
      for (const p of toUpdate) {
        const id = existing.get(p.empNo)!.id;
        const nationalId = p.nationalId ? { nationalIdHash: p.nationalId.hash, nationalIdMasked: p.nationalId.masked } : {};
        await ctx.tx.update(employees).set({ ...p.values, ...nationalId, updatedAt: new Date(), updatedBy: me }).where(eq(employees.id, id));
        audits.push({ action: 'update', subjectTable: 'employees', subjectId: id, employeeId: id, dataCategory: 'identity', reason: 'employee import' });
      }
      if (audits.length) await recordAudit(ctx, audits);
      const active = await afterEmployeeChange(ctx);
      report.committed = true;
      report.seats.activeEmployees = active;
    } else {
      report.seats.activeEmployees = projectedActive();
    }
    const [subscription] = await ctx.tx.select({ seatLimit: tenantSubscriptions.seatLimit }).from(tenantSubscriptions)
      .orderBy(...currentSubscriptionFirst()).limit(1);
    report.seats.seatLimit = subscription?.seatLimit ?? null;
    report.seats.overLimit = report.seats.seatLimit !== null && report.seats.activeEmployees > report.seats.seatLimit;
    return report;
  }
}

/** After employees change: the month's `active_employees` usage is the current headcount, and age events are raised. */
async function afterEmployeeChange(ctx: RequestContext, employeeIds?: string[]): Promise<number> {
  const [{ active }] = await ctx.tx.select({ active: sql<number>`count(*)::int` }).from(employees).where(eq(employees.status, '在職')) as [{ active: number }];
  await ctx.tx.insert(usageCounters)
    .values({ tenantId: ctx.tenant.id, period: sql`date_trunc('month', current_date)::date`, metric: 'active_employees', quantity: active })
    .onConflictDoUpdate({ target: [usageCounters.tenantId, usageCounters.period, usageCounters.metric], set: { quantity: active, updatedAt: new Date() } });
  await raiseAgeEvents(ctx, employeeIds);
  return active;
}

function toRecord(e: typeof employees.$inferSelect): EmployeeRecordDto {
  return {
    id: e.id, empNo: e.empNo, name: e.name, sex: e.sex, birthDate: e.birthDate, legalEntityId: e.legalEntityId, siteId: e.siteId, departmentId: e.departmentId,
    title: e.title, shift: e.shift, examCategory: e.examCategory, specialOperations: e.specialOperations, lang: e.lang, hireDate: e.hireDate,
    email: e.email, phone: e.phone, status: e.status, nationalIdMasked: e.nationalIdMasked,
  };
}
