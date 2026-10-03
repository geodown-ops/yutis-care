import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiProperty, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { staffRoleEnum } from '@yutis/db';
import { Ctx, signedIn, type RequestContext, type StaffRole } from '../core/context.js';
import { SignedIn } from './access.js';
import { DATA_CATEGORIES, FEATURES, ROLE_ACCESS, type DataCategory, type Feature } from './permissions.js';
import { siteAccess } from './site-access.js';

class SiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'S1' }) code!: string;
  @ApiProperty({ example: '桃園廠' }) name!: string;
}

class BreakGlassSiteDto extends SiteDto {
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}

class StaffMeDto {
  @ApiProperty({ enum: ['staff'] }) kind!: 'staff';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: staffRoleEnum.enumValues }) role!: StaffRole;
  @ApiProperty({ type: [SiteDto], description: '負責廠區' }) sites!: SiteDto[];
  @ApiProperty({ type: [BreakGlassSiteDto], description: '有效的破窗存取授權' }) breakGlassSites!: BreakGlassSiteDto[];
  @ApiProperty({ enum: DATA_CATEGORIES, isArray: true, description: '角色可見的資料敏感等級' }) dataCategories!: readonly DataCategory[];
  @ApiProperty({ enum: FEATURES, isArray: true, description: '可用功能；前端據此顯示選單，實際權限由後端檢查' }) features!: readonly Feature[];
}

class EmployeeMeDto {
  @ApiProperty({ enum: ['employee'] }) kind!: 'employee';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '員工端語言：zh、en、ja、vi、th' }) lang!: string;
}

@ApiTags('auth')
@ApiExtraModels(StaffMeDto, EmployeeMeDto)
@Controller('me')
export class MeController {
  @Get()
  @SignedIn()
  @ApiOperation({ summary: '目前登入者、角色、負責廠區與可用功能' })
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(StaffMeDto) }, { $ref: getSchemaPath(EmployeeMeDto) }],
      discriminator: { propertyName: 'kind', mapping: { staff: getSchemaPath(StaffMeDto), employee: getSchemaPath(EmployeeMeDto) } },
    },
  })
  async me(@Ctx() ctx: RequestContext): Promise<StaffMeDto | EmployeeMeDto> {
    const p = signedIn(ctx);
    if (p.kind === 'employee') return { kind: 'employee', id: p.employeeId, name: p.name, lang: p.lang };
    const { assigned, breakGlass } = await siteAccess(ctx.tx, p.userId);
    const access = ROLE_ACCESS[p.role];
    return {
      kind: 'staff', id: p.userId, name: p.name, email: p.email, role: p.role,
      sites: assigned, breakGlassSites: breakGlass, dataCategories: access.data, features: access.features,
    };
  }
}
