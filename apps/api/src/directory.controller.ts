/*
 * Names any staff screen needs to fill pickers and label rows: who the active staff are (with their work email, for
 * sign-off signers), and the organisation tree. No health data; editing stays with tenant admins (/api/admin/users,
 * /api/admin/org).
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { departments, legalEntities, sites, staffRoleEnum, users } from '@yutis/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from './auth/access.js';
import { Ctx, type RequestContext, type StaffRole } from './core/context.js';
import { parse } from './core/validation.js';
import { mySiteIds } from './programs/common.js';

class StaffMemberDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '公司 Email（例如帶入簽核人員）' }) email!: string;
  @ApiProperty({ enum: staffRoleEnum.enumValues }) role!: StaffRole;
}

class DirectoryDepartmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) code!: string | null;
  @ApiProperty() name!: string;
}
class DirectorySiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '是你負責的廠區（含破窗中的）' }) mine!: boolean;
  @ApiProperty({ type: [DirectoryDepartmentDto] }) departments!: DirectoryDepartmentDto[];
}
class DirectoryLegalEntityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [DirectorySiteDto] }) sites!: DirectorySiteDto[];
}

const StaffQuery = z.object({
  roles: z.string().optional()
    .transform(v => v ? v.split(',').map(r => r.trim()).filter(Boolean) : [])
    .pipe(z.array(z.enum(staffRoleEnum.enumValues)).max(staffRoleEnum.enumValues.length)),
});

@ApiTags('tenant')
@Controller()
export class DirectoryController {
  @Get('staff')
  @StaffOnly()
  @ApiOperation({ summary: '啟用中的後台人員', description: '選執行人員、面談醫師等用；可用 roles 篩選（逗號分隔），例如 roles=職護,職醫。' })
  @ApiQuery({ name: 'roles', required: false, type: String, example: '職護,職醫' })
  @ApiOkResponse({ type: [StaffMemberDto] })
  async staff(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<StaffMemberDto[]> {
    const { roles } = parse(StaffQuery, query);
    return ctx.tx.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users)
      .where(and(eq(users.active, true), roles.length ? inArray(users.role, roles) : undefined)).orderBy(asc(users.name));
  }

  @Get('org')
  @StaffOnly()
  @ApiOperation({ summary: '組織架構（名稱）', description: '法人 → 廠區 → 部門的代碼與名稱，供篩選與顯示；mine 標出你負責的廠區。' })
  @ApiOkResponse({ type: [DirectoryLegalEntityDto] })
  async org(@Ctx() ctx: RequestContext): Promise<DirectoryLegalEntityDto[]> {
    const [entities, siteRows, deptRows, mine] = await Promise.all([
      ctx.tx.select({ id: legalEntities.id, code: legalEntities.code, name: legalEntities.name }).from(legalEntities).orderBy(asc(legalEntities.code)),
      ctx.tx.select({ id: sites.id, legalEntityId: sites.legalEntityId, code: sites.code, name: sites.name }).from(sites).orderBy(asc(sites.code)),
      ctx.tx.select({ id: departments.id, siteId: departments.siteId, code: departments.code, name: departments.name }).from(departments).orderBy(asc(departments.name)),
      mySiteIds(ctx),
    ]);
    return entities.map(e => ({
      ...e,
      sites: siteRows.filter(s => s.legalEntityId === e.id).map(s => ({
        id: s.id, code: s.code, name: s.name, mine: mine.includes(s.id),
        departments: deptRows.filter(d => d.siteId === s.id).map(d => ({ id: d.id, code: d.code, name: d.name })),
      })),
    }));
  }
}
