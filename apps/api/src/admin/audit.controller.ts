/*
 * Audit search (稽核查詢): tenant admins look up who did what to whose data, e.g. everyone who opened one employee's
 * records, for a breach response or a 個資法 §3 request. Read-only; the log itself is append-only. Each search is itself
 * recorded in the audit log.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { auditActionEnum, auditLog, employees, staffRoleEnum, users } from '@yutis/db';
import { and, count, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { DATA_CATEGORIES } from '../auth/permissions.js';
import { recordAudit, type AuditAction } from '../core/audit.js';
import { Ctx, type RequestContext, type StaffRole } from '../core/context.js';
import { parse } from '../core/validation.js';

class AuditActorDto {
  @ApiProperty({ enum: ['staff', 'employee', 'system'], description: '後台人員、員工本人（員工端或確認連結），或系統排程' }) kind!: 'staff' | 'employee' | 'system';
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) id!: string | null;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: staffRoleEnum.enumValues, description: '後台人員的角色' }) role!: StaffRole | null;
}

class AuditEmployeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
}

class AuditEntryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ type: String, format: 'date-time' }) at!: Date;
  @ApiProperty({ type: AuditActorDto }) actor!: AuditActorDto;
  @ApiProperty({ enum: auditActionEnum.enumValues, description: '讀取、新增、修改、刪除、匯出、登入、破窗' }) action!: AuditAction;
  @ApiProperty({ type: String, nullable: true, example: 'assist_records' }) subjectTable!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) subjectId!: string | null;
  @ApiProperty({ type: AuditEmployeeDto, nullable: true, description: '資料屬於哪位員工' }) employee!: AuditEmployeeDto | null;
  @ApiProperty({ type: String, nullable: true, enum: DATA_CATEGORIES, description: '資料敏感等級' }) dataCategory!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
}

class AuditPageDto {
  @ApiProperty({ description: '符合條件的總筆數' }) total!: number;
  @ApiProperty({ type: [AuditEntryDto], description: '新的在前' }) items!: AuditEntryDto[];
}

const isoDate = z.iso.date();
const AuditQuery = z.object({
  employeeId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  action: z.enum(auditActionEnum.enumValues).optional(),
  dataCategory: z.enum(DATA_CATEGORIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).refine(q => !q.from || !q.to || q.from <= q.to, { message: 'from must not be after to', path: ['to'] });

/** Taiwan midnight of an ISO date, as an instant. */
const twMidnight = (date: string) => new Date(`${date}T00:00:00+08:00`);
const nextDay = (date: string) => new Date(twMidnight(date).getTime() + 86_400_000);

const actorEmployees = alias(employees, 'actor_employees');

@ApiTags('admin')
@Controller('admin/audit')
export class AuditController {
  @Get()
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiOperation({
    summary: '稽核查詢',
    description: '依員工、操作者、動作、資料等級與日期（台灣時間，含起訖兩天）查詢稽核日誌，新的在前。每次查詢也記入稽核。',
  })
  @ApiQuery({ name: 'employeeId', required: false, type: String, format: 'uuid', description: '資料屬於這位員工' })
  @ApiQuery({ name: 'actorUserId', required: false, type: String, format: 'uuid', description: '這位後台人員做的' })
  @ApiQuery({ name: 'action', required: false, enum: auditActionEnum.enumValues })
  @ApiQuery({ name: 'dataCategory', required: false, enum: DATA_CATEGORIES })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每頁筆數，預設 50，最多 200' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '略過的筆數，預設 0' })
  @ApiOkResponse({ type: AuditPageDto })
  async search(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<AuditPageDto> {
    const q = parse(AuditQuery, query);
    const where: SQL[] = [];
    if (q.employeeId) where.push(eq(auditLog.employeeId, q.employeeId));
    if (q.actorUserId) where.push(eq(auditLog.actorUserId, q.actorUserId));
    if (q.action) where.push(eq(auditLog.action, q.action));
    if (q.dataCategory) where.push(eq(auditLog.dataCategory, q.dataCategory));
    if (q.from) where.push(gte(auditLog.at, twMidnight(q.from)));
    if (q.to) where.push(lt(auditLog.at, nextDay(q.to)));

    // Count and page before this search's own entry is written, so it never shows up in its own results.
    const [{ total }] = await ctx.tx.select({ total: count() }).from(auditLog).where(and(...where)) as [{ total: number }];
    const rows = await ctx.tx.select({
      log: auditLog, actorName: users.name, actorRole: users.role, actorEmployeeName: actorEmployees.name,
      employeeEmpNo: employees.empNo, employeeName: employees.name,
    }).from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .leftJoin(actorEmployees, eq(actorEmployees.id, auditLog.actorEmployeeId))
      .leftJoin(employees, eq(employees.id, auditLog.employeeId))
      .where(and(...where)).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(q.limit).offset(q.offset);

    const filters = Object.entries(q).filter(([k, v]) => v !== undefined && k !== 'limit' && k !== 'offset').map(([k, v]) => `${k}=${v}`);
    await recordAudit(ctx, {
      action: 'read', subjectTable: 'audit_log', employeeId: q.employeeId, dataCategory: 'identity',
      reason: `audit search${filters.length ? ` ${filters.join(' ')}` : ''}`,
    });

    return {
      total,
      items: rows.map(({ log, ...r }): AuditEntryDto => ({
        id: log.id, at: log.at,
        actor: log.actorUserId ? { kind: 'staff', id: log.actorUserId, name: r.actorName, role: r.actorRole }
          : log.actorEmployeeId ? { kind: 'employee', id: log.actorEmployeeId, name: r.actorEmployeeName, role: null }
          : { kind: 'system', id: null, name: null, role: null },
        action: log.action, subjectTable: log.subjectTable, subjectId: log.subjectId,
        employee: log.employeeId && r.employeeName ? { id: log.employeeId, empNo: r.employeeEmpNo!, name: r.employeeName } : null,
        dataCategory: log.dataCategory, reason: log.reason, ip: log.ip,
      })),
    };
  }
}
