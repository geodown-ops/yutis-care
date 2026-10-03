import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import pg from 'pg';
import { NoTenant, Public } from './auth/access.js';
import { Ctx, type RequestContext } from './core/context.js';
import { PG_POOL } from './core/database.js';

class TenantDto {
  @ApiProperty({ description: '子網域', example: 'acme' }) slug!: string;
  @ApiProperty({ description: '公司名稱', example: '範例股份有限公司' }) name!: string;
}

class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

@ApiTags('tenant')
@Controller()
export class TenantController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get('tenant')
  @Public()
  @ApiOperation({ summary: '網址子網域對應的租戶', description: '前端啟動時呼叫，登入前即可使用。' })
  @ApiOkResponse({ type: TenantDto })
  tenant(@Ctx() ctx: RequestContext): TenantDto {
    return { slug: ctx.tenant.slug, name: ctx.tenant.name };
  }

  @Get('health')
  @NoTenant()
  @ApiOperation({ summary: '健康檢查（Cloud Run）' })
  @ApiOkResponse({ type: HealthDto })
  async health(): Promise<HealthDto> {
    try {
      await this.pool.query('select 1');
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
