import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { platformRoleEnum, platformUsers } from '@yutis/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Requires } from './auth/access.js';
import { recordPlatformAudit } from './core/audit.js';
import { Ctx, type PlatformRole, type RequestContext } from './core/context.js';
import { pgErrorCode } from './core/pg.js';
import { openApiSchema, parse } from './core/validation.js';

class PlatformUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: platformRoleEnum.enumValues }) role!: PlatformRole;
  @ApiProperty() active!: boolean;
}

const CreatePlatformUser = z.object({
  email: z.email().toLowerCase(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(platformRoleEnum.enumValues),
}).strict();
const UpdatePlatformUser = z.object({ name: CreatePlatformUser.shape.name, role: CreatePlatformUser.shape.role, active: z.boolean() }).partial().strict();

const columns = { id: platformUsers.id, email: platformUsers.email, name: platformUsers.name, role: platformUsers.role, active: platformUsers.active };

/** Platform accounts (平台帳號). Access itself is granted in Identity-Aware Proxy; this decides the role. */
@ApiTags('platform-users')
@Controller('platform-users')
export class PlatformUsersController {
  @Get()
  @Requires('platform-users:manage')
  @ApiOperation({ summary: '平台人員' })
  @ApiOkResponse({ type: [PlatformUserDto] })
  list(@Ctx() ctx: RequestContext): Promise<PlatformUserDto[]> {
    return ctx.tx.select(columns).from(platformUsers).orderBy(asc(platformUsers.email));
  }

  @Post()
  @Requires('platform-users:manage')
  @ApiOperation({ summary: '新增平台人員', description: '還需要在 Identity-Aware Proxy 加入此帳號才能登入。' })
  @ApiBody({ schema: openApiSchema(CreatePlatformUser) })
  @ApiCreatedResponse({ type: PlatformUserDto })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<PlatformUserDto> {
    const input = parse(CreatePlatformUser, body);
    const [existing] = await ctx.tx.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.email, input.email));
    if (existing) throw new ConflictException({ code: 'platform_user_exists', message: `${input.email} already exists` });
    try {
      const [row] = await ctx.tx.insert(platformUsers).values(input).returning(columns);
      await recordPlatformAudit(ctx, { action: 'platform_user.create', subjectTable: 'platform_users', subjectId: row!.id, detail: { email: input.email, role: input.role } });
      return row!;
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException({ code: 'platform_user_exists', message: `${input.email} already exists` });
      throw error;
    }
  }

  @Patch(':id')
  @Requires('platform-users:manage')
  @ApiOperation({ summary: '修改平台人員（角色、停用）' })
  @ApiBody({ schema: openApiSchema(UpdatePlatformUser) })
  @ApiOkResponse({ type: PlatformUserDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<PlatformUserDto> {
    const input = parse(UpdatePlatformUser, body);
    if (id === ctx.user.id && (input.active === false || (input.role && input.role !== ctx.user.role))) {
      throw new BadRequestException({ code: 'cannot_change_self', message: 'You cannot deactivate yourself or change your own role' });
    }
    const [row] = await ctx.tx.update(platformUsers).set({ ...input, updatedAt: new Date() }).where(eq(platformUsers.id, id)).returning(columns);
    if (!row) throw new NotFoundException({ code: 'platform_user_not_found', message: 'No such platform user' });
    await recordPlatformAudit(ctx, { action: 'platform_user.update', subjectTable: 'platform_users', subjectId: id, detail: input });
    return row;
  }
}
