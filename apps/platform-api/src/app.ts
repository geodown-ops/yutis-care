import 'reflect-metadata';
import { Controller, Get, Inject, Module, ServiceUnavailableException, type DynamicModule, type LoggerService, type LogLevel } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import pg from 'pg';
import { AnnouncementsController } from './announcements.controller.js';
import { PlatformAuditController } from './audit.controller.js';
import { IAP_SECURITY, Public, SIGN_IN_SECURITY } from './auth/access.js';
import { PlatformAccessGuard } from './auth/access.guard.js';
import {
  DevIdentityVerifier, GoogleSignInIdentityVerifier, IAP_HEADER, IapIdentityVerifier, PLATFORM_IDENTITY, type PlatformIdentityVerifier,
} from './auth/identity.js';
import type { PlatformConfig } from './config.js';
import { CoreModule, PG_POOL } from './core/database.js';
import { createMailer, MAILER, type Mailer } from './core/mail.js';
import { BILLING, defaultIntegrations, IDENTITY_TENANTS, INVITATIONS, TENANT_KEYS, type Integrations } from './integrations/integrations.js';
import { MeController } from './me.controller.js';
import { PlansUsageController } from './plans-usage.controller.js';
import { PlatformUsersController } from './platform-users.controller.js';
import { TemplatesController } from './templates/templates.js';
import { OnboardingService } from './tenants/onboarding.js';
import { TenantsController } from './tenants/tenants.controller.js';
import { TrialApplicationsController } from './trials/trial-applications.controller.js';

class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

class SignInConfigDto {
  @ApiProperty({ enum: ['iap', 'google', 'dev'], description: 'iap：由 Identity-Aware Proxy 把關，不需登入頁；google：以 Firebase Auth SDK 用 Google 帳號登入；dev：本機開發（X-Dev-Platform-User）' })
  method!: 'iap' | 'google' | 'dev';
  @ApiPropertyOptional({ description: 'method=google 時：Identity Platform 專案的瀏覽器 API 金鑰（公開值）' }) apiKey?: string;
  @ApiPropertyOptional({ description: 'method=google 時：驗證網域，例如 yutis-care-prod.firebaseapp.com' }) authDomain?: string;
}

const PLATFORM_CONFIG = Symbol('PLATFORM_CONFIG');

@ApiTags('sign-in')
@Controller('sign-in-config')
class SignInConfigController {
  constructor(@Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig) {}

  @Get()
  @Public()
  @ApiOperation({ summary: '平台後台登入頁的設定', description: 'method=google 時，登入頁以 Firebase Auth SDK（不帶 tenantId）用 Google 帳號登入，之後每個請求帶 Authorization: Bearer <ID token>。' })
  @ApiOkResponse({ type: SignInConfigDto })
  get(): SignInConfigDto {
    const { signIn, devAuth } = this.config;
    if (signIn) return { method: 'google', apiKey: signIn.apiKey, authDomain: signIn.authDomain };
    return { method: devAuth ? 'dev' : 'iap' };
  }
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
  mailer?: Mailer;
}

@Module({})
export class AppModule {
  static forRoot(config: PlatformConfig, overrides: AppOverrides = {}): DynamicModule {
    const integrations = { ...defaultIntegrations(config), ...overrides.integrations };
    const identity = overrides.identity ?? (config.devAuth ? new DevIdentityVerifier()
      : config.signIn ? new GoogleSignInIdentityVerifier(config.signIn.projectId) : new IapIdentityVerifier(config.iapAudience!));
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(config)],
      controllers: [
        HealthController, SignInConfigController, MeController, TenantsController, PlansUsageController, AnnouncementsController, PlatformUsersController,
        TemplatesController, PlatformAuditController, TrialApplicationsController,
      ],
      providers: [
        { provide: PLATFORM_CONFIG, useValue: config },
        { provide: PLATFORM_IDENTITY, useValue: identity },
        { provide: TENANT_KEYS, useValue: integrations.keys },
        { provide: IDENTITY_TENANTS, useValue: integrations.identityTenants },
        { provide: INVITATIONS, useValue: integrations.invitations },
        { provide: BILLING, useValue: integrations.billing },
        { provide: MAILER, useValue: overrides.mailer ?? createMailer(config.email) },
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
    .setDescription('平台管理後台（admin.care.yutis.net）用：租戶開通與停用、官網的線上申請試用、方案與訂閱、用量計數、公告、平台人員、平台稽核紀錄。以 yutis_platform 資料庫角色連線，看不到任何員工或健康資料。')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: IAP_HEADER, description: 'Identity-Aware Proxy 簽發的 JWT，由 IAP 自動帶入（Google Cloud）' }, IAP_SECURITY)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Google 登入後的 Identity Platform ID token（Railway 等不經 IAP 的部署）' }, SIGN_IN_SECURITY)
    .build();
  return SwaggerModule.createDocument(app, options);
}
