import 'reflect-metadata';
import { Controller, Get, Inject, Module, ServiceUnavailableException, type DynamicModule, type LoggerService, type LogLevel } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags, DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import pg from 'pg';
import { AnnouncementsController } from './announcements.controller.js';
import { PlatformAuditController } from './audit.controller.js';
import { IAP_SECURITY, Public } from './auth/access.js';
import { PlatformAccessGuard } from './auth/access.guard.js';
import { DevIdentityVerifier, IAP_HEADER, IapIdentityVerifier, PLATFORM_IDENTITY, type PlatformIdentityVerifier } from './auth/identity.js';
import type { PlatformConfig } from './config.js';
import { CoreModule, PG_POOL } from './core/database.js';
import { BILLING, defaultIntegrations, IDENTITY_TENANTS, INVITATIONS, TENANT_KEYS, type Integrations } from './integrations/integrations.js';
import { MeController } from './me.controller.js';
import { PlansUsageController } from './plans-usage.controller.js';
import { PlatformUsersController } from './platform-users.controller.js';
import { TemplatesController } from './templates/templates.js';
import { OnboardingService } from './tenants/onboarding.js';
import { TenantsController } from './tenants/tenants.controller.js';

class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get()
  @Public()
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

export interface AppOverrides {
  integrations?: Partial<Integrations>;
  identity?: PlatformIdentityVerifier;
}

@Module({})
export class AppModule {
  static forRoot(config: PlatformConfig, overrides: AppOverrides = {}): DynamicModule {
    const integrations = { ...defaultIntegrations(config), ...overrides.integrations };
    const identity = overrides.identity ?? (config.devAuth ? new DevIdentityVerifier() : new IapIdentityVerifier(config.iapAudience!));
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(config)],
      controllers: [
        HealthController, MeController, TenantsController, PlansUsageController, AnnouncementsController, PlatformUsersController, TemplatesController,
        PlatformAuditController,
      ],
      providers: [
        { provide: PLATFORM_IDENTITY, useValue: identity },
        { provide: TENANT_KEYS, useValue: integrations.keys },
        { provide: IDENTITY_TENANTS, useValue: integrations.identityTenants },
        { provide: INVITATIONS, useValue: integrations.invitations },
        { provide: BILLING, useValue: integrations.billing },
        { provide: APP_GUARD, useClass: PlatformAccessGuard },
        OnboardingService,
      ],
    };
  }
}

export interface CreateAppOptions {
  logger?: LoggerService | LogLevel[] | false;
  overrides?: AppOverrides;
  /** Root module; defaults to AppModule. Tests wrap AppModule to add probe routes. */
  module?: DynamicModule;
}

export async function createApp(config: PlatformConfig, options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    options.module ?? AppModule.forRoot(config, options.overrides),
    new FastifyAdapter({ trustProxy: config.trustProxy }),
    { logger: options.logger ?? (config.production ? ['log', 'warn', 'error'] : undefined) },
  );
  app.setGlobalPrefix('platform-api');
  if (!config.production) SwaggerModule.setup('platform-api/docs', app, () => openApiDocument(app));
  return app;
}

export function openApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Yutis Care 平台 API')
    .setDescription('平台管理後台（admin.care.yutis.com.tw）用：租戶開通與停用、方案與訂閱、用量計數、公告、平台人員、平台稽核紀錄。以 yutis_platform 資料庫角色連線，看不到任何員工或健康資料。')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: IAP_HEADER, description: 'Identity-Aware Proxy 簽發的 JWT，由 IAP 自動帶入' }, IAP_SECURITY)
    .build();
  return SwaggerModule.createDocument(app, options);
}
