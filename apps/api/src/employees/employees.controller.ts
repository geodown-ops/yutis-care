/*
 * Employee directory (員工資料): search the employees of the sites the staff member is responsible for, and open one
 * employee's basic data. Identity data only: 職護、職醫 and 人資 (permissions.ts); health data has its own routes.
 * Only employees in the caller's sites (or under an unexpired break-glass grant) are returned, and every employee
 * returned is recorded in the audit log.
 */
import { Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { departments, employees, sites, type Tx } from '@yutis/db';
import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { assertSiteAccess, siteAccess } from '../auth/site-access.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { parse } from '../core/validation.js';

const DirectoryAccess = () => StaffOnly({ data: 'identity', feature: 'employees' });
const STATUSES = ['在職', '留停', '離職'] as const;

class SiteRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'TY' }) code!: string;
  @ApiProperty({ example: '桃園廠' }) name!: string;
}

class DepartmentRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '製造一課' }) name!: string;
}

class EmployeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'E10234', description: '工號' }) empNo!: string;
  @ApiProperty({ example: '林志明' }) name!: string;
  @ApiProperty({ enum: ['男', '女'] }) sex!: '男' | '女';
  @ApiProperty({ format: 'date' }) birthDate!: string;
  @ApiProperty({ type: SiteRefDto }) site!: SiteRefDto;
  @ApiProperty({ type: DepartmentRefDto }) department!: DepartmentRefDto;
  @ApiProperty({ type: String, nullable: true, example: '技術員' }) title!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '常日班' }) shift!: string | null;
  @ApiProperty({ enum: STATUSES }) status!: (typeof STATUSES)[number];
}

class EmployeeDetailDto extends EmployeeDto {
  @ApiProperty({
    type: String, nullable: true, example: 'A1•••••789',
    description: '遮罩後的身分證字號；系統不存完整號碼，所以無法顯示全碼。員工主檔沒有匯入身分證字號時為 null。',
  })
  nationalIdMasked!: string | null;
}

class EmployeePageDto {
  @ApiProperty({ description: '符合條件的總人數' }) total!: number;
  @ApiProperty({ type: [EmployeeDto] }) items!: EmployeeDto[];
}

const ListQuery = z.object({
  q: z.string().trim().max(50).optional(),
  siteId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Employees with their site and department; RLS keeps it to the request's tenant. */
const selectEmployees = (tx: Tx) => tx.select({
  id: employees.id, empNo: employees.empNo, name: employees.name, sex: employees.sex, birthDate: employees.birthDate,
  title: employees.title, shift: employees.shift, status: employees.status, nationalIdMasked: employees.nationalIdMasked,
  siteId: sites.id, siteCode: sites.code, siteName: sites.name, departmentId: departments.id, departmentName: departments.name,
}).from(employees)
  .innerJoin(sites, and(eq(sites.tenantId, employees.tenantId), eq(sites.id, employees.siteId)))
  .innerJoin(departments, and(eq(departments.tenantId, employees.tenantId), eq(departments.id, employees.departmentId)))
  .$dynamic();
type Row = Awaited<ReturnType<typeof selectEmployees>>[number];

const toDto = (r: Row): EmployeeDto => ({
  id: r.id, empNo: r.empNo, name: r.name, sex: r.sex, birthDate: r.birthDate,
  site: { id: r.siteId, code: r.siteCode, name: r.siteName }, department: { id: r.departmentId, name: r.departmentName },
  title: r.title, shift: r.shift, status: r.status,
});

/** `%` and `_` typed by the user are literal characters, not wildcards. */
export const contains = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

@ApiTags('employees')
@Controller('employees')
export class EmployeeDirectoryController {
  @Get()
  @DirectoryAccess()
  @ApiOperation({
    summary: '搜尋負責廠區的員工',
    description: '只列出負責廠區（或有效破窗授權）的員工，依工號排序。q 比對姓名或工號。每位列出的員工都記入稽核。',
  })
  @ApiQuery({ name: 'q', required: false, type: String, description: '姓名或工號的一部分' })
  @ApiQuery({ name: 'siteId', required: false, type: String, format: 'uuid', description: '只看某個廠區；不是負責廠區時回 403' })
  @ApiQuery({ name: 'departmentId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: STATUSES })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每頁筆數，預設 50，最多 200' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '略過的筆數，預設 0' })
  @ApiOkResponse({ type: EmployeePageDto })
  async list(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<EmployeePageDto> {
    const q = parse(ListQuery, query);
    const access = await siteAccess(ctx.tx, staff(ctx).userId);
    const siteIds = [...access.assigned, ...access.breakGlass].map(s => s.id);
    if (q.siteId && !siteIds.includes(q.siteId)) throw new ForbiddenException({ code: 'outside_sites', message: 'Site is outside your sites' });
    if (!siteIds.length) return { total: 0, items: [] };

    const where: SQL[] = [inArray(employees.siteId, q.siteId ? [q.siteId] : siteIds)];
    if (q.departmentId) where.push(eq(employees.departmentId, q.departmentId));
    if (q.status) where.push(eq(employees.status, q.status));
    if (q.q) where.push(or(ilike(employees.name, contains(q.q)), ilike(employees.empNo, contains(q.q)))!);

    const [{ total }] = await ctx.tx.select({ total: count() }).from(employees).where(and(...where)) as [{ total: number }];
    const rows = await selectEmployees(ctx.tx).where(and(...where)).orderBy(asc(employees.empNo)).limit(q.limit).offset(q.offset);
    if (rows.length) {
      await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'employees', employeeId: r.id, dataCategory: 'identity', reason: 'employee list' })));
    }
    return { total, items: rows.map(toDto) };
  }

  @Get(':id')
  @DirectoryAccess()
  @ApiOperation({ summary: '員工基本資料', description: '只限負責廠區（或有效破窗授權）的員工；讀取記入稽核。' })
  @ApiOkResponse({ type: EmployeeDetailDto })
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDetailDto> {
    const [row] = await selectEmployees(ctx.tx).where(eq(employees.id, id));
    if (!row) throw new NotFoundException({ code: 'employee_not_found', message: 'No such employee' });
    await assertSiteAccess(ctx.tx, staff(ctx), row.siteId);
    await recordAudit(ctx, { action: 'read', subjectTable: 'employees', subjectId: id, employeeId: id, dataCategory: 'identity', reason: 'employee detail' });
    return { ...toDto(row), nationalIdMasked: row.nationalIdMasked };
  }
}
