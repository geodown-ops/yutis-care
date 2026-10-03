/*
 * Retention review (保存期限): rows whose statutory retention date has passed, found by the worker's nightly scan,
 * listed for occupational health staff to review and delete by hand. Nothing is ever deleted automatically.
 */
import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { employees, retentionFindings } from '@yutis/db';
import { asc, eq } from 'drizzle-orm';
import { StaffOnly } from '../auth/access.js';
import { CLINICAL_ROLES } from '../auth/permissions.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { scanRetention } from '../worker/work.js';

const Clinical = () => StaffOnly({ roles: CLINICAL_ROLES });

class FindingDto {
  @ApiProperty({ example: 'health_exams' }) table!: string;
  @ApiProperty({ format: 'uuid' }) rowId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) employeeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) empNo!: string | null;
  @ApiProperty({ type: String, format: 'date' }) retainUntil!: string;
  @ApiProperty({ type: String, format: 'date-time' }) foundAt!: Date;
}

@ApiTags('retention')
@Controller('retention')
export class RetentionController {
  @Get()
  @Clinical()
  @ApiOperation({ summary: '已過保存期限、待人工確認刪除的資料', description: '由背景工作每晚掃描；系統不會自動刪除。' })
  @ApiOkResponse({ type: [FindingDto] })
  async list(@Ctx() ctx: RequestContext): Promise<FindingDto[]> {
    const rows = await ctx.tx.select({ f: retentionFindings, empNo: employees.empNo }).from(retentionFindings)
      .leftJoin(employees, eq(employees.id, retentionFindings.employeeId)).orderBy(asc(retentionFindings.retainUntil));
    await recordAudit(ctx, { action: 'read', subjectTable: 'retention_findings', reason: `${rows.length} finding(s)` });
    return rows.map(({ f, empNo }) => ({ table: f.tableName, rowId: f.rowId, employeeId: f.employeeId, empNo, retainUntil: f.retainUntil, foundAt: f.foundAt }));
  }

  @Post('scan')
  @HttpCode(200)
  @Clinical()
  @ApiOperation({ summary: '立即掃描此租戶', description: '與每晚的背景工作相同，只列出，不刪除。' })
  @ApiOkResponse({ schema: { type: 'object', properties: { found: { type: 'number' } } } })
  async scan(@Ctx() ctx: RequestContext): Promise<{ found: number }> {
    const found = await scanRetention(ctx.tx, ctx.tenant.id);
    await recordAudit(ctx, { action: 'read', subjectTable: 'retention_findings', reason: `manual scan: ${found} row(s) past retain_until` });
    return { found };
  }
}
