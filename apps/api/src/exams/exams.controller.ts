/*
 * Health checks (健檢): import clinic files through a mapping, grade them with the tenant's published rule set
 * (@yutis/domain gradeReport), keep per-employee history, and raise abnormal events (grade ≥ 3, special level ≥ 2).
 * Only occupational health staff (職護、職醫) reach these routes, only for employees in their sites; every read of
 * results is audited, and medical text (history, symptoms, work notes) is stored encrypted.
 */
import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiProduces, ApiProperty, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { caseEvents, employees, examBatches, examImportMappings, healthExamResults, healthExams, users } from '@yutis/db';
import { EXAM_EVENT_GRADE, EXAM_ITEMS, examRetainUntil, gradeReport, SPECIAL_EVENT_LEVEL, type ExamValues } from '@yutis/domain';
import { asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { canSee } from '../auth/permissions.js';
import { assertSiteAccess, siteAccess } from '../auth/site-access.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { decryptOptional, encryptOptional, TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { ApiErrorDto } from '../core/errors.js';
import { parse } from '../core/validation.js';
import { ExamMappingDto, type ExamMappingInput } from '../admin/exam-settings.controller.js';
import { ImportIssueDto, isIsoDate, readSheet, readWorkbook, refuseIfInvalid, sendXlsx, templateWorkbook, XLSX_MIME, type ImportIssue } from '../admin/excel.js';
import { currentRuleSet, ruleSetVersions } from './rules.js';

const ExamAccess = () => StaffOnly({ data: 'health', feature: 'employees' });
const NATIONAL_ID = /^[A-Z][12890ABCD]\d{8}$/;

class ExamItemDto {
  @ApiProperty({ example: 'B0111' }) code!: string;
  @ApiProperty({ example: '血壓－收縮壓' }) name!: string;
  @ApiProperty({ example: 'mmHg' }) unit!: string;
  @ApiProperty({ type: String, nullable: true, description: '數值或文字結果' }) value!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: '分級 1–4；沒有對應規則時為 null' }) grade!: number | null;
}

class ExamSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date' }) examDate!: string;
  @ApiProperty({ type: String, nullable: true }) clinic!: string | null;
  @ApiProperty() kind!: string;
  @ApiProperty({ description: '各項分級加總' }) gradeTotal!: number;
  @ApiProperty({ description: '最高分級' }) gradeMax!: number;
  @ApiProperty({ description: '分級所依據的分級標準版本' }) ruleSetVersion!: number;
  @ApiProperty({ type: String, nullable: true }) specialHazard!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: '特殊健檢管理分級' }) specialLevel!: number | null;
  @ApiProperty({ type: Boolean, nullable: true }) smoker!: boolean | null;
  @ApiProperty({ type: [ExamItemDto] }) items!: ExamItemDto[];
}

class ExamDetailDto extends ExamSummaryDto {
  @ApiProperty({ type: String, nullable: true, description: '病史（醫療資料，只給職護、職醫）' }) history!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '自覺症狀' }) symptoms!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '作業經歷與工作描述' }) workNote!: string | null;
}

class ExamImportRowDto {
  @ApiProperty({ description: 'Excel 列號' }) row!: number;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: 'date' }) examDate!: string;
  @ApiProperty() kind!: string;
  @ApiProperty({ description: '最高分級' }) gradeMax!: number;
  @ApiProperty({ description: '各項分級加總' }) gradeTotal!: number;
  @ApiProperty({ type: Number, nullable: true, description: '特殊健檢管理分級' }) specialLevel!: number | null;
  @ApiProperty({ description: '這筆會產生的異常事件數（只有員工最新一次健檢會產生）' }) events!: number;
}

class ExamImportReportDto {
  @ApiProperty() committed!: boolean;
  @ApiProperty() rows!: number;
  @ApiProperty({ description: '可匯入的健檢筆數' }) exams!: number;
  @ApiProperty({ type: [ImportIssueDto] }) issues!: ImportIssue[];
  @ApiProperty({ description: '分級依據的版本' }) ruleSetVersion!: number;
  @ApiProperty({ description: '最高分級 3 級以上的人數' }) grade3Plus!: number;
  @ApiProperty({ description: '寫入後新產生的異常事件數（預覽時為預估）' }) newEvents!: number;
  @ApiProperty({ type: [ExamImportRowDto], description: '可匯入的每一筆（沒有錯誤的列），依 Excel 列號排序' }) preview!: ExamImportRowDto[];
}

class ExamBatchDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() clinic!: string;
  @ApiProperty({ type: String, nullable: true }) fileName!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: '檔案資料列數' }) rowCount!: number | null;
  @ApiProperty({ description: '這批匯入的健檢筆數（全租戶）' }) exams!: number;
  @ApiProperty({ type: String, format: 'date-time' }) importedAt!: Date;
  @ApiProperty({ type: String, nullable: true, description: '匯入人員' }) importedBy!: string | null;
}

const ImportQuery = z.object({
  mapping: z.uuid(),
  commit: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  fileName: z.string().max(200).optional(),
});

interface ParsedExam {
  row: number;
  employeeId: string;
  empNo: string;
  name: string;
  examDate: string;
  kind: string;
  values: Record<string, string | null>;
  grades: Record<string, number | null>;
  total: number;
  max: number;
  smoker: boolean | null;
  specialHazard: string | null;
  specialLevel: number | null;
  history: string | null;
  symptoms: string | null;
  workNote: string | null;
  latest: boolean;
}

@ApiTags('exams')
@Controller()
export class ExamsController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Get('exams/mappings')
  @ExamAccess()
  @ApiOperation({ summary: '可用的健檢匯入對照（匯入時選擇）' })
  @ApiOkResponse({ type: [ExamMappingDto] })
  async mappings(@Ctx() ctx: RequestContext): Promise<ExamMappingDto[]> {
    const rows = await ctx.tx.select().from(examImportMappings).orderBy(asc(examImportMappings.clinic));
    return rows.map(r => ({ id: r.id, clinic: r.clinic, mapping: r.mapping as ExamMappingDto['mapping'] }));
  }

  @Get('exams/mappings/:id/template')
  @ExamAccess()
  @ApiOperation({ summary: '依健檢匯入對照產生的空白檔（.xlsx）', description: '欄位名稱與這家醫院的對照相同；粗體為必填。' })
  @ApiProduces(XLSX_MIME)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    const [row] = await ctx.tx.select().from(examImportMappings).where(eq(examImportMappings.id, id));
    if (!row) throw new NotFoundException({ code: 'mapping_not_found', message: 'No such import mapping' });
    const { columns: c, items } = row.mapping as Omit<ExamMappingInput, 'clinic'>;
    const required = [c.empNo ?? c.nationalId!, c.examDate];
    const optional = [c.empNo && c.nationalId, c.kind, c.smoker, c.history, c.symptoms, c.workNote, c.specialHazard, c.specialLevel, ...Object.values(items)]
      .filter((h): h is string => Boolean(h) && !required.includes(h!));
    return sendXlsx(reply, `${row.clinic}健檢匯入範本.xlsx`, await templateWorkbook([{ name: '健檢結果', required, optional: [...new Set(optional)] }]));
  }

  @Get('exams/batches')
  @ExamAccess()
  @ApiOperation({ summary: '健檢匯入紀錄（新的在前）', description: '每次匯入的醫院、檔名、筆數與匯入人員；不含健檢內容。' })
  @ApiOkResponse({ type: [ExamBatchDto] })
  async batches(@Ctx() ctx: RequestContext): Promise<ExamBatchDto[]> {
    const rows = await ctx.tx.select({ b: examBatches, importedBy: users.name }).from(examBatches).leftJoin(users, eq(users.id, examBatches.createdBy))
      .where(eq(examBatches.status, 'imported')).orderBy(desc(examBatches.createdAt)).limit(200);
    const counts = rows.length
      ? await ctx.tx.select({ batchId: healthExams.batchId, n: count() }).from(healthExams).where(inArray(healthExams.batchId, rows.map(r => r.b.id))).groupBy(healthExams.batchId)
      : [];
    return rows.map(({ b, importedBy }) => ({
      id: b.id, clinic: b.clinic, fileName: b.fileName, rowCount: b.rowCount, exams: counts.find(c => c.batchId === b.id)?.n ?? 0, importedAt: b.createdAt, importedBy,
    }));
  }

  @Post('exams/import')
  @HttpCode(200)
  @ExamAccess()
  @ApiOperation({
    summary: '匯入健檢結果',
    description: '依選定醫院的欄位對照讀取第一個工作表，以工號或身分證字號對應員工（只能匯入負責廠區的員工），依目前發布的分級標準分級，'
      + '最高分級 3 級以上或特殊健檢 2 級以上產生異常事件。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。',
  })
  @ApiConsumes(XLSX_MIME)
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'mapping', type: String, format: 'uuid', description: '健檢匯入對照 id' })
  @ApiQuery({ name: 'commit', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'fileName', required: false, type: String })
  @ApiOkResponse({ type: ExamImportReportDto })
  @ApiUnprocessableEntityResponse({ description: '檔案有錯誤（import_invalid），未寫入', type: ApiErrorDto })
  async import(@Ctx() ctx: RequestContext, @Body() body: unknown, @Query() query: unknown): Promise<ExamImportReportDto> {
    const q = parse(ImportQuery, query);
    const [mappingRow] = await ctx.tx.select().from(examImportMappings).where(eq(examImportMappings.id, q.mapping));
    if (!mappingRow) throw new NotFoundException({ code: 'mapping_not_found', message: 'No such import mapping' });
    const mapping = mappingRow.mapping as Omit<ExamMappingInput, 'clinic'>;
    const workbook = await readWorkbook(body);
    const ruleSet = await currentRuleSet(ctx.tx);
    const me = staff(ctx);

    const issues: ImportIssue[] = [];
    const sheet = workbook.worksheets[0];
    const c = mapping.columns;
    const required = [c.examDate, ...(c.empNo ? [c.empNo] : []), ...(c.nationalId && !c.empNo ? [c.nationalId] : [])];
    const { rows, issues: headerIssues } = sheet ? readSheet(sheet, required) : { rows: [], issues: [{ row: 1, message: '檔案沒有工作表' }] };
    issues.push(...headerIssues);
    const add = (row: number, column: string, message: string) => issues.push({ row, column, message });

    const all = await ctx.tx.select({ id: employees.id, empNo: employees.empNo, name: employees.name, nationalIdHash: employees.nationalIdHash, sex: employees.sex, siteId: employees.siteId }).from(employees);
    const access = await siteAccess(ctx.tx, me.userId);
    const mySites = new Set([...access.assigned, ...access.breakGlass].map(s => s.id));
    const textCodes = new Set(ruleSet.rules.filter(r => r.type === 'text').map(r => r.code));
    const keyOf = new Map(EXAM_ITEMS.map(i => [i.code, i.key]));
    const existing = await ctx.tx.select({ employeeId: healthExams.employeeId, examDate: healthExams.examDate, kind: healthExams.kind }).from(healthExams);
    const latestDate = new Map<string, string>();
    for (const e of existing) if ((latestDate.get(e.employeeId) ?? '') < e.examDate) latestDate.set(e.employeeId, e.examDate);
    const seen = new Set<string>();

    const parsed: ParsedExam[] = [];
    for (const { row, values: v } of rows) {
      const before = issues.length;
      let employee: (typeof all)[number] | undefined;
      if (c.empNo && v[c.empNo]) {
        employee = all.find(e => e.empNo === v[c.empNo!]);
        if (!employee) add(row, c.empNo, `找不到工號 ${v[c.empNo]}`);
      } else if (c.nationalId && v[c.nationalId]) {
        const id = v[c.nationalId]!.toUpperCase();
        if (!NATIONAL_ID.test(id)) add(row, c.nationalId, '身分證字號格式錯誤');
        else {
          const hash = await this.crypto.fingerprint(ctx.tenant.id, id);
          employee = all.find(e => e.nationalIdHash === hash);
          if (!employee) add(row, c.nationalId, '找不到此身分證字號的員工（員工主檔需先匯入身分證字號）');
        }
      } else add(row, c.empNo ?? c.nationalId!, '必填');
      if (employee && !mySites.has(employee.siteId)) add(row, c.empNo ?? c.nationalId!, '此員工不在您負責的廠區');

      const examDate = v[c.examDate] ?? '';
      if (!examDate) add(row, c.examDate, '必填');
      else if (!isIsoDate(examDate)) add(row, c.examDate, '日期格式應為 YYYY-MM-DD');
      const kind = (c.kind && v[c.kind]) || '年度健檢';
      if (employee && examDate) {
        const key = `${employee.id}/${examDate}/${kind}`;
        if (seen.has(key)) add(row, c.examDate, '同一員工同一天的同類健檢在檔案中重複');
        else if (existing.some(e => e.employeeId === employee!.id && e.examDate === examDate && e.kind === kind)) add(row, c.examDate, '此筆健檢已匯入過');
        seen.add(key);
      }

      const values: Record<string, string | null> = {};
      const domainValues: ExamValues = {};
      for (const [code, column] of Object.entries(mapping.items)) {
        if (!column) continue;
        const raw = v[column] ?? '';
        if (raw === '') { values[code] = null; continue; }
        if (!textCodes.has(code) && !Number.isFinite(Number(raw))) { add(row, column, `「${raw}」不是數值`); continue; }
        values[code] = raw;
        domainValues[keyOf.get(code)!] = textCodes.has(code) ? raw : Number(raw);
      }
      const smokerRaw = c.smoker ? v[c.smoker] ?? '' : '';
      const smoker = smokerRaw === '' ? null : ['是', 'Y', 'y', '1', '有'].includes(smokerRaw) ? true : ['否', 'N', 'n', '0', '無'].includes(smokerRaw) ? false : undefined;
      if (smoker === undefined) add(row, c.smoker!, '吸菸應填 是／否');
      const levelRaw = c.specialLevel ? v[c.specialLevel] ?? '' : '';
      const specialLevel = levelRaw === '' ? null : Number(levelRaw);
      if (specialLevel !== null && !(Number.isInteger(specialLevel) && specialLevel >= 1 && specialLevel <= 4)) add(row, c.specialLevel!, '特殊健檢管理分級應為 1–4');

      if (issues.length > before || !employee) continue;
      const graded = gradeReport(domainValues, employee.sex, ruleSet.rules);
      parsed.push({
        row, employeeId: employee.id, empNo: employee.empNo, name: employee.name, examDate, kind, values,
        grades: Object.fromEntries(graded.items.filter(i => i.code in mapping.items).map(i => [i.code, i.lv])),
        total: graded.total, max: graded.max, smoker: smoker ?? null,
        specialHazard: (c.specialHazard && v[c.specialHazard]) || null, specialLevel,
        history: (c.history && v[c.history]) || null, symptoms: (c.symptoms && v[c.symptoms]) || null, workNote: (c.workNote && v[c.workNote]) || null,
        latest: false,
      });
    }
    // Events come from each employee's latest exam, as in the prototype.
    for (const p of parsed) {
      const newer = parsed.some(o => o.employeeId === p.employeeId && o.examDate > p.examDate);
      p.latest = !newer && (latestDate.get(p.employeeId) ?? '') <= p.examDate;
    }
    const eventsFor = (p: ParsedExam) => (p.latest ? Number(p.max >= EXAM_EVENT_GRADE) + Number((p.specialLevel ?? 0) >= SPECIAL_EVENT_LEVEL) : 0);

    const report: ExamImportReportDto = {
      committed: false, rows: rows.length, exams: parsed.length, issues, ruleSetVersion: ruleSet.version,
      grade3Plus: new Set(parsed.filter(p => p.max >= 3).map(p => p.employeeId)).size,
      newEvents: parsed.reduce((n, p) => n + eventsFor(p), 0),
      preview: parsed.map(p => ({
        row: p.row, employeeId: p.employeeId, empNo: p.empNo, name: p.name, examDate: p.examDate, kind: p.kind, gradeMax: p.max, gradeTotal: p.total,
        specialLevel: p.specialLevel, events: eventsFor(p),
      })),
    };
    refuseIfInvalid(report, !q.commit);
    if (!q.commit) return report;

    const [batch] = await ctx.tx.insert(examBatches).values({
      tenantId: ctx.tenant.id, clinic: mappingRow.clinic, fileName: q.fileName ?? null, mapping, rowCount: rows.length, status: 'imported', createdBy: me.userId,
    }).returning({ id: examBatches.id });
    const audits: AuditEntry[] = [];
    for (const p of parsed) {
      const [exam] = await ctx.tx.insert(healthExams).values({
        tenantId: ctx.tenant.id, employeeId: p.employeeId, batchId: batch!.id, examDate: p.examDate, clinic: mappingRow.clinic, kind: p.kind,
        ruleSetId: ruleSet.id, gradeTotal: p.total, gradeMax: p.max, smoker: p.smoker, specialHazard: p.specialHazard, specialLevel: p.specialLevel,
        historyEnc: await encryptOptional(this.crypto, ctx.tenant.id, p.history),
        symptomsEnc: await encryptOptional(this.crypto, ctx.tenant.id, p.symptoms),
        workNoteEnc: await encryptOptional(this.crypto, ctx.tenant.id, p.workNote),
        retainUntil: examRetainUntil(p.examDate, !!(p.specialHazard || p.specialLevel)),
        createdBy: me.userId,
      }).returning({ id: healthExams.id });
      const results = Object.entries(p.values).filter(([, value]) => value !== null);
      if (results.length) {
        await ctx.tx.insert(healthExamResults).values(results.map(([code, value]) => ({
          tenantId: ctx.tenant.id, examId: exam!.id, itemCode: code, grade: p.grades[code] ?? null,
          ...(textCodes.has(code) ? { valueText: value } : { valueNum: value }),
        })));
      }
      if (p.latest && p.max >= EXAM_EVENT_GRADE) {
        await ctx.tx.insert(caseEvents).values({
          tenantId: ctx.tenant.id, employeeId: p.employeeId, type: 'hc', sourceTable: 'health_exams', sourceId: exam!.id, occurredOn: p.examDate,
          description: `健康檢查／體格檢查報告異常：最大級 ${p.max} 級（總分 ${p.total}）`,
        });
      }
      if (p.latest && (p.specialLevel ?? 0) >= SPECIAL_EVENT_LEVEL) {
        await ctx.tx.insert(caseEvents).values({
          tenantId: ctx.tenant.id, employeeId: p.employeeId, type: 'sp', sourceTable: 'health_exams', sourceId: exam!.id, occurredOn: p.examDate,
          description: `特殊健檢異常：${p.specialHazard ?? ''}第 ${p.specialLevel} 級管理`,
        });
      }
      audits.push({ action: 'create', subjectTable: 'health_exams', subjectId: exam!.id, employeeId: p.employeeId, dataCategory: 'health', reason: `exam import ${mappingRow.clinic}` });
    }
    if (audits.length) await recordAudit(ctx, audits);
    report.committed = true;
    return report;
  }

  @Get('employees/:employeeId/exams')
  @ExamAccess()
  @ApiOperation({ summary: '員工的健檢歷史（新的在前）', description: '不含病史、症狀等醫療文字；每次讀取都記入稽核。' })
  @ApiOkResponse({ type: [ExamSummaryDto] })
  async history(@Ctx() ctx: RequestContext, @Param('employeeId', ParseUUIDPipe) employeeId: string): Promise<ExamSummaryDto[]> {
    await this.assertEmployee(ctx, employeeId);
    const exams = await ctx.tx.select().from(healthExams).where(eq(healthExams.employeeId, employeeId)).orderBy(desc(healthExams.examDate));
    await recordAudit(ctx, { action: 'read', subjectTable: 'health_exams', employeeId, dataCategory: 'health', reason: 'exam history' });
    return this.summaries(ctx, exams);
  }

  @Get('exams/:id')
  @ExamAccess()
  @ApiOperation({ summary: '單次健檢（含病史、症狀等醫療文字）', description: '醫療文字只解密給可見醫療資料的角色；讀取記入稽核。' })
  @ApiOkResponse({ type: ExamDetailDto })
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ExamDetailDto> {
    const [exam] = await ctx.tx.select().from(healthExams).where(eq(healthExams.id, id));
    if (!exam) throw new NotFoundException({ code: 'not_found', message: 'No such exam' });
    await this.assertEmployee(ctx, exam.employeeId);
    const medical = canSee(staff(ctx).role, 'medical');
    await recordAudit(ctx, { action: 'read', subjectTable: 'health_exams', subjectId: id, employeeId: exam.employeeId, dataCategory: medical ? 'medical' : 'health' });
    const [summary] = await this.summaries(ctx, [exam]);
    const text = (data: Buffer | null) => (medical ? decryptOptional(this.crypto, ctx.tenant.id, data) : Promise.resolve(null));
    return { ...summary!, history: await text(exam.historyEnc), symptoms: await text(exam.symptomsEnc), workNote: await text(exam.workNoteEnc) };
  }

  private async assertEmployee(ctx: RequestContext, employeeId: string) {
    const [employee] = await ctx.tx.select({ siteId: employees.siteId }).from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new NotFoundException({ code: 'employee_not_found', message: 'No such employee' });
    await assertSiteAccess(ctx.tx, staff(ctx), employee.siteId);
  }

  private async summaries(ctx: RequestContext, exams: (typeof healthExams.$inferSelect)[]): Promise<ExamSummaryDto[]> {
    if (!exams.length) return [];
    const results = await ctx.tx.select().from(healthExamResults).where(inArray(healthExamResults.examId, exams.map(e => e.id)));
    const versions = await ruleSetVersions(ctx.tx, [...new Set(exams.map(e => e.ruleSetId))]);
    return exams.map(e => ({
      id: e.id, examDate: e.examDate, clinic: e.clinic, kind: e.kind, gradeTotal: e.gradeTotal, gradeMax: e.gradeMax,
      ruleSetVersion: versions.get(e.ruleSetId)!, specialHazard: e.specialHazard, specialLevel: e.specialLevel, smoker: e.smoker,
      items: EXAM_ITEMS.flatMap(item => {
        const r = results.find(x => x.examId === e.id && x.itemCode === item.code);
        return r ? [{ code: item.code, name: item.name, unit: item.unit, value: r.valueText ?? r.valueNum, grade: r.grade }] : [];
      }),
    }));
  }
}
