/*
 * Employee master import (員工匯入): an Excel sheet, validated first, then created or updated by 工號 (emp_no).
 * Exceeding the subscription's seat limit only warns; it never blocks an import. After a committed import the
 * month's `active_employees` usage counter is set to the number of current employees. National ID numbers (身分證字號)
 * are never stored: only a per-tenant keyed fingerprint, used to match clinic files.
 */
import { Body, Controller, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { departments, employees, legalEntities, sites, tenantSubscriptions, usageCounters } from '@yutis/db';
import { desc, eq, sql } from 'drizzle-orm';
import { StaffOnly } from '../auth/access.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { ApiErrorDto } from '../core/errors.js';
import { parse } from '../core/validation.js';
import { ImportIssueDto, isEmail, isIsoDate, readSheet, readWorkbook, refuseIfInvalid, XLSX_MIME, type ImportIssue } from './excel.js';
import { ImportQuery } from './org.controller.js';

export const EMPLOYEE_COLUMNS = {
  required: ['工號', '姓名', '性別', '出生日期', '法人代碼', '廠區代碼', '部門'],
  optional: ['身分證字號', '職稱', '班別', '健檢類別', '特殊作業', '語言', '到職日', 'Email', '手機', '狀態'],
} as const;
const LANGS = ['zh', 'en', 'ja', 'vi', 'th'];
const STATUSES = ['在職', '留停', '離職'] as const;
/** Taiwan national ID or resident certificate number: a letter, then 1/2 (or 8/9, A–D for residents), then 8 digits. */
const NATIONAL_ID = /^[A-Z][12890ABCD]\d{8}$/;

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

type EmployeeValues = Omit<typeof employees.$inferInsert, 'id' | 'tenantId' | 'empNo' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'nationalIdHash'>;
const COMPARED: (keyof EmployeeValues)[] = [
  'name', 'sex', 'birthDate', 'legalEntityId', 'siteId', 'departmentId', 'title', 'shift', 'examCategory', 'specialOperations', 'lang', 'hireDate', 'email', 'phone', 'status',
];

@ApiTags('admin')
@Controller('admin/employees')
export class EmployeesController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Post('import')
  @HttpCode(200)
  @StaffOnly({ feature: 'tenant-admin', data: 'identity' })
  @ApiOperation({
    summary: '以 Excel 匯入員工主檔',
    description: `第一個工作表，第一列為欄位名稱。必填：${EMPLOYEE_COLUMNS.required.join('、')}；選填：${EMPLOYEE_COLUMNS.optional.join('、')}。`
      + '依工號新增或更新（檔案裡沒有的員工不會被刪除；離職請填狀態）。組織需先建立。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。超過人數上限只提醒。',
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
    const parsed: { row: number; empNo: string; values: EmployeeValues; nationalIdHash?: string }[] = [];
    for (const { row, values: v } of rows) {
      const before = issues.length;
      for (const c of EMPLOYEE_COLUMNS.required) if (!v[c]) add(row, c, '必填');
      if (v['工號'] && seen.has(v['工號'])) add(row, '工號', '工號在檔案中重複');
      seen.add(v['工號'] ?? '');
      if (v['性別'] && v['性別'] !== '男' && v['性別'] !== '女') add(row, '性別', '應為「男」或「女」');
      for (const c of ['出生日期', '到職日']) if (v[c] && !isIsoDate(v[c]!)) add(row, c, '日期格式應為 YYYY-MM-DD');
      if (v['Email'] && !isEmail(v['Email'])) add(row, 'Email', 'Email 格式錯誤');
      if (v['語言'] && !LANGS.includes(v['語言'])) add(row, '語言', `應為 ${LANGS.join('、')} 之一`);
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
        row, empNo: v['工號']!, ...(nationalIdHash ? { nationalIdHash } : {}),
        values: {
          name: v['姓名']!, sex: v['性別'] as '男' | '女', birthDate: v['出生日期']!, legalEntityId: le.id, siteId: site.id, departmentId: dept.id,
          title: v['職稱'] || null, shift: v['班別'] || null, examCategory: v['健檢類別'] || null,
          specialOperations: (v['特殊作業'] ?? '').split(/[、,，;；]/).map(s => s.trim()).filter(Boolean),
          lang: v['語言'] || 'zh', hireDate: v['到職日'] || null, email: v['Email']?.toLowerCase() || null, phone: v['手機'] || null,
          status: (v['狀態'] || '在職') as (typeof STATUSES)[number],
        },
      });
    }

    const toCreate = parsed.filter(p => !existing.has(p.empNo));
    const toUpdate = parsed.filter(p => {
      const cur = existing.get(p.empNo);
      return cur && (COMPARED.some(k => JSON.stringify(cur[k] ?? null) !== JSON.stringify(p.values[k] ?? null))
        || (p.nationalIdHash !== undefined && p.nationalIdHash !== cur.nationalIdHash));
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
          .values(toCreate.slice(i, i + 500).map(p => ({ ...p.values, empNo: p.empNo, nationalIdHash: p.nationalIdHash ?? null, tenantId: ctx.tenant.id, createdBy: me })))
          .returning({ id: employees.id });
        audits.push(...created.map(c => ({ action: 'create' as const, subjectTable: 'employees', subjectId: c.id, employeeId: c.id, dataCategory: 'identity' as const, reason: 'employee import' })));
      }
      for (const p of toUpdate) {
        const id = existing.get(p.empNo)!.id;
        await ctx.tx.update(employees).set({ ...p.values, ...(p.nationalIdHash ? { nationalIdHash: p.nationalIdHash } : {}), updatedAt: new Date(), updatedBy: me }).where(eq(employees.id, id));
        audits.push({ action: 'update', subjectTable: 'employees', subjectId: id, employeeId: id, dataCategory: 'identity', reason: 'employee import' });
      }
      if (audits.length) await recordAudit(ctx, audits);
      const [{ active }] = await ctx.tx.select({ active: sql<number>`count(*)::int` }).from(employees).where(eq(employees.status, '在職')) as [{ active: number }];
      await ctx.tx.insert(usageCounters)
        .values({ tenantId: ctx.tenant.id, period: sql`date_trunc('month', current_date)::date`, metric: 'active_employees', quantity: active })
        .onConflictDoUpdate({ target: [usageCounters.tenantId, usageCounters.period, usageCounters.metric], set: { quantity: active, updatedAt: new Date() } });
      report.committed = true;
      report.seats.activeEmployees = active;
    } else {
      report.seats.activeEmployees = projectedActive();
    }
    const [subscription] = await ctx.tx.select({ seatLimit: tenantSubscriptions.seatLimit }).from(tenantSubscriptions)
      .orderBy(desc(tenantSubscriptions.startsOn), desc(tenantSubscriptions.createdAt)).limit(1);
    report.seats.seatLimit = subscription?.seatLimit ?? null;
    report.seats.overLimit = report.seats.seatLimit !== null && report.seats.activeEmployees > report.seats.seatLimit;
    return report;
  }
}
