import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import pg from 'pg';
import { NoTenant, Public } from './auth/access.js';
import { IDENTITY_VERIFIER, LOGIN_METHODS, type IdentityPlatformSignIn, type IdentityVerifier, type LoginMethod, type SignInProvider } from './auth/identity.js';
import { Ctx, type RequestContext } from './core/context.js';
import { PG_POOL } from './core/database.js';
import { ApiErrorDto } from './core/errors.js';

class SignInProviderDto implements SignInProvider {
  @ApiProperty({ description: '登入 SDK 的提供者 id', example: 'saml.acme' }) id!: string;
  @ApiProperty({ description: '登入按鈕文字', example: 'Acme 公司帳號' }) label!: string;
}

class IdentityPlatformDto implements IdentityPlatformSignIn {
  @ApiProperty({ description: 'Firebase Auth 的瀏覽器 API key（公開資訊）' }) apiKey!: string;
  @ApiProperty({ example: 'yutis-care-prod.firebaseapp.com' }) authDomain!: string;
  @ApiProperty({ description: '這個租戶在 Identity Platform 的租戶 id' }) tenantId!: string;
  @ApiProperty({ type: SignInProviderDto, isArray: true, description: '已啟用的 SSO 提供者' }) providers!: SignInProviderDto[];
}

class TenantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: '公司名稱', example: '範例股份有限公司' }) name!: string;
  @ApiProperty({ description: '子網域', example: 'acme' }) subdomain!: string;
  @ApiProperty({ type: String, nullable: true, description: '公司 Logo；尚未設定時為 null' }) logoUrl!: string | null;
  @ApiProperty({ enum: LOGIN_METHODS, isArray: true, description: '登入頁要顯示的登入方式；dev 只在本機開發模式出現' })
  loginMethods!: LoginMethod[];
  @ApiProperty({ type: IdentityPlatformDto, nullable: true, description: '登入頁的 Identity Platform 設定；本機開發與示範站為 null' })
  identityPlatform!: IdentityPlatformDto | null;
}

class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

@ApiTags('tenant')
@Controller()
export class TenantController {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
  ) {}

  @Get('tenant')
  @Public()
  @ApiOperation({ summary: '網址子網域對應的租戶', description: '前端啟動時呼叫，登入前即可使用。' })
  @ApiOkResponse({ type: TenantDto })
  async tenant(@Ctx() ctx: RequestContext): Promise<TenantDto> {
    const { id, name, slug } = ctx.tenant;
    // Logo arrives with the tenant settings (tenant-admin API).
    const [loginMethods, identityPlatform] = await Promise.all([this.identity.loginMethods(ctx.tenant), this.identity.signInConfig(ctx.tenant)]);
    return { id, name, subdomain: slug, logoUrl: null, loginMethods, identityPlatform };
  }

  @Get('health')
  @NoTenant()
  @ApiOperation({ summary: '健康檢查（Cloud Run）' })
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorDto })
  async health(): Promise<HealthDto> {
    try {
      await this.pool.query('select 1');
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
