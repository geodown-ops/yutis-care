import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { platformRoleEnum } from '@yutis/db';
import { AnyPlatformUser } from './auth/access.js';
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from './auth/permissions.js';
import { Ctx, type PlatformRole, type RequestContext } from './core/context.js';

class PlatformMeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: platformRoleEnum.enumValues }) role!: PlatformRole;
  @ApiProperty({ enum: PERMISSIONS, isArray: true, description: '這個角色能做的事；畫面依此隱藏按鈕（API 仍會逐一檢查）' }) permissions!: Permission[];
}

/** The signed-in platform user (目前登入的平台人員). */
@ApiTags('me')
@Controller('me')
export class MeController {
  @Get()
  @AnyPlatformUser()
  @ApiOperation({ summary: '目前登入的平台人員與權限' })
  @ApiOkResponse({ type: PlatformMeDto })
  me(@Ctx() ctx: RequestContext): PlatformMeDto {
    const { id, email, name, role } = ctx.user;
    return { id, email, name, role, permissions: [...ROLE_PERMISSIONS[role]] };
  }
}
