import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import { Module, type DynamicModule, type LoggerService, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AdminModule } from './admin/admin.module.js';
import { CareModule } from './care/care.module.js';
import { ProgramsModule } from './programs/programs.module.js';
import { MAX_IMPORT_BYTES, XLSX_MIME } from './admin/excel.js';
import { SESSION_SECURITY } from './auth/access.js';
import { AuthModule } from './auth/auth.module.js';
import type { ApiConfig } from './config.js';
import { CoreModule } from './core/database.js';
import { TenantController } from './tenant.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(config), AuthModule.register({ devSignIn: config.devSignIn }), AdminModule, CareModule, ProgramsModule],
      controllers: [TenantController],
    };
  }
}

export interface CreateAppOptions {
  logger?: LoggerService | LogLevel[] | false;
  /** Root module; defaults to AppModule. Tests wrap AppModule to add probe routes. */
  module?: DynamicModule;
}

export async function createApp(config: ApiConfig, options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    options.module ?? AppModule.forRoot(config),
    new FastifyAdapter({ trustProxy: config.trustProxy }),
    { logger: options.logger ?? (config.production ? ['log', 'warn', 'error'] : undefined) },
  );
  app.setGlobalPrefix('api');
  await app.register(fastifyCookie);
  // Excel imports arrive as the raw .xlsx body.
  app.getHttpAdapter().getInstance().addContentTypeParser(XLSX_MIME, { parseAs: 'buffer', bodyLimit: MAX_IMPORT_BYTES }, (_req, body, done) => done(null, body));
  if (!config.production) SwaggerModule.setup('api/docs', app, () => openApiDocument(app));
  return app;
}

export function openApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Yutis Care 租戶 API')
    .setDescription('租戶後台與員工端共用。租戶由網址子網域決定（{租戶}.care.yutis.com.tw/api），登入狀態以 session cookie 維持。')
    .setVersion('0.1.0')
    .addCookieAuth('__Host-yutis_session', { type: 'apiKey', in: 'cookie' }, SESSION_SECURITY)
    .build();
  return SwaggerModule.createDocument(app, options);
}
