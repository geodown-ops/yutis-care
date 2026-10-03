import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { announcementKindEnum, announcements } from '@yutis/db';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Requires } from './auth/access.js';
import { recordPlatformAudit } from './core/audit.js';
import { Ctx, type RequestContext } from './core/context.js';
import { openApiSchema, parse } from './core/validation.js';

class AnnouncementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'null 表示所有租戶' }) tenantId!: string | null;
  @ApiProperty({ enum: announcementKindEnum.enumValues, description: '維護、新功能、一般公告' }) kind!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, format: 'date-time' }) publishAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: Date | null;
}

const fields = {
  tenantId: z.uuid().nullable(),
  kind: z.enum(announcementKindEnum.enumValues),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  publishAt: z.iso.datetime({ offset: true }).transform(s => new Date(s)),
  expiresAt: z.iso.datetime({ offset: true }).transform(s => new Date(s)).nullable(),
};
const CreateAnnouncement = z.object({
  ...fields, tenantId: fields.tenantId.default(null), kind: fields.kind.default('notice'), publishAt: fields.publishAt.optional(), expiresAt: fields.expiresAt.default(null),
}).strict();
const UpdateAnnouncement = z.object(fields).partial().strict();

const columns = {
  id: announcements.id, tenantId: announcements.tenantId, kind: announcements.kind, title: announcements.title,
  body: announcements.body, publishAt: announcements.publishAt, expiresAt: announcements.expiresAt,
};
const notFound = () => new NotFoundException({ code: 'announcement_not_found', message: 'No such announcement' });

/** System announcements (系統公告), shown in tenant back offices through the tenant_announcements view. */
@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  @Get()
  @Requires('tenants:read')
  @ApiOperation({ summary: '公告列表（新的在前）' })
  @ApiOkResponse({ type: [AnnouncementDto] })
  list(@Ctx() ctx: RequestContext): Promise<AnnouncementDto[]> {
    return ctx.tx.select(columns).from(announcements).orderBy(desc(announcements.publishAt));
  }

  @Post()
  @Requires('announcements:write')
  @ApiOperation({ summary: '新增公告' })
  @ApiBody({ schema: openApiSchema(CreateAnnouncement) })
  @ApiCreatedResponse({ type: AnnouncementDto })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<AnnouncementDto> {
    const input = parse(CreateAnnouncement, body);
    const [row] = await ctx.tx.insert(announcements).values({ ...input, createdBy: ctx.user.id }).returning(columns);
    await recordPlatformAudit(ctx, { action: 'announcement.create', tenantId: input.tenantId ?? undefined, subjectTable: 'announcements', subjectId: row!.id, detail: { title: input.title } });
    return row!;
  }

  @Patch(':id')
  @Requires('announcements:write')
  @ApiOperation({ summary: '修改公告' })
  @ApiBody({ schema: openApiSchema(UpdateAnnouncement) })
  @ApiOkResponse({ type: AnnouncementDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AnnouncementDto> {
    const input = parse(UpdateAnnouncement, body);
    const [row] = await ctx.tx.update(announcements).set({ ...input, updatedAt: new Date() }).where(eq(announcements.id, id)).returning(columns);
    if (!row) throw notFound();
    await recordPlatformAudit(ctx, { action: 'announcement.update', tenantId: row.tenantId ?? undefined, subjectTable: 'announcements', subjectId: id, detail: { fields: Object.keys(input) } });
    return row;
  }

  @Delete(':id')
  @HttpCode(204)
  @Requires('announcements:write')
  @ApiOperation({ summary: '刪除公告' })
  @ApiNoContentResponse()
  async remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const [row] = await ctx.tx.delete(announcements).where(eq(announcements.id, id)).returning({ title: announcements.title, tenantId: announcements.tenantId });
    if (!row) throw notFound();
    await recordPlatformAudit(ctx, { action: 'announcement.delete', tenantId: row.tenantId ?? undefined, subjectTable: 'announcements', subjectId: id, detail: { title: row.title } });
  }
}
