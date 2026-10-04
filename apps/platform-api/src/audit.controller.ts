import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { platformAuditLog, platformUsers, tenants } from '@yutis/db';
import { and, count, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Requires } from './auth/access.js';
import { Ctx, type RequestContext } from './core/context.js';
import { parse } from './core/validation.js';

class PlatformAuditActorDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) id!: string | null;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true, description: '平台人員已刪除時為 null' }) name!: string | null;
}

class PlatformAuditTenantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() subdomain!: string;
  @ApiProperty() name!: string;
}

class PlatformAuditEntryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ type: String, format: 'date-time' }) at!: Date;
  @ApiProperty({ type: PlatformAuditActorDto }) actor!: PlatformAuditActorDto;
  @ApiProperty({ example: 'tenant.suspend', description: '例如 tenant.onboard、tenant.suspend、subscription.renew、plan.update、announcement.create' }) action!: string;
  @ApiProperty({ type: PlatformAuditTenantDto, nullable: true }) tenant!: PlatformAuditTenantDto | null;
  @ApiProperty({ type: String, nullable: true }) subjectTable!: string | null;
  @ApiProperty({ type: String, nullable: true }) subjectId!: string | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true, description: '改了什麼；不含任何租戶員工資料' }) detail!: unknown;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
}

class PlatformAuditPageDto {
  @ApiProperty({ description: '符合條件的總筆數' }) total!: number;
  @ApiProperty({ type: [PlatformAuditEntryDto], description: '新的在前' }) items!: PlatformAuditEntryDto[];
}

const isoDate = z.iso.date();
const AuditQuery = z.object({
  tenantId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).refine(q => !q.from || !q.to || q.from <= q.to, { message: 'from must not be after to', path: ['to'] });

/** Taiwan midnight of an ISO date, as an instant. */
const twMidnight = (date: string) => new Date(`${date}T00:00:00+08:00`);

/** The platform audit log (平台稽核紀錄), read-only. */
@ApiTags('audit')
@Controller('audit')
export class PlatformAuditController {
  @Get()
  @Requires('audit:read')
  @ApiOperation({ summary: '平台稽核紀錄', description: '平台後台的所有變更，新的在前。日期為台灣時間，含起訖兩天。' })
  @ApiQuery({ name: 'tenantId', required: false, type: String, format: 'uuid', description: '只看對這個租戶的操作' })
  @ApiQuery({ name: 'actorId', required: false, type: String, format: 'uuid', description: '只看這位平台人員的操作' })
  @ApiQuery({ name: 'action', required: false, type: String, example: 'tenant.suspend' })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每頁筆數，預設 50，最多 200' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '略過的筆數，預設 0' })
  @ApiOkResponse({ type: PlatformAuditPageDto })
  async list(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<PlatformAuditPageDto> {
    const q = parse(AuditQuery, query);
    const where: SQL[] = [];
    if (q.tenantId) where.push(eq(platformAuditLog.tenantId, q.tenantId));
    if (q.actorId) where.push(eq(platformAuditLog.actorId, q.actorId));
    if (q.action) where.push(eq(platformAuditLog.action, q.action));
    if (q.from) where.push(gte(platformAuditLog.at, twMidnight(q.from)));
    if (q.to) where.push(lt(platformAuditLog.at, new Date(twMidnight(q.to).getTime() + 86_400_000)));

    const [{ total }] = await ctx.tx.select({ total: count() }).from(platformAuditLog).where(and(...where)) as [{ total: number }];
    const rows = await ctx.tx.select({ log: platformAuditLog, actorName: platformUsers.name, tenantSlug: tenants.slug, tenantName: tenants.name })
      .from(platformAuditLog)
      .leftJoin(platformUsers, eq(platformUsers.id, platformAuditLog.actorId))
      .leftJoin(tenants, eq(tenants.id, platformAuditLog.tenantId))
      .where(and(...where)).orderBy(desc(platformAuditLog.at), desc(platformAuditLog.id)).limit(q.limit).offset(q.offset);
    return {
      total,
      items: rows.map(({ log, actorName, tenantSlug, tenantName }) => ({
        id: log.id, at: log.at, actor: { id: log.actorId, email: log.actorEmail, name: actorName },
        action: log.action,
        tenant: log.tenantId && tenantSlug && tenantName ? { id: log.tenantId, subdomain: tenantSlug, name: tenantName } : null,
        subjectTable: log.subjectTable, subjectId: log.subjectId, detail: log.detail, ip: log.ip,
      })),
    };
  }
}
