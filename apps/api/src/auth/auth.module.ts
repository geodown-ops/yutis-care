import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard.js';
import { AuthController } from './auth.controller.js';
import { DevIdentityVerifier, IDENTITY_VERIFIER, UnconfiguredIdentityVerifier } from './identity.js';
import { MeController } from './me.controller.js';
import { SessionService } from './sessions.js';

@Module({})
export class AuthModule {
  static register(options: { devSignIn: boolean }): DynamicModule {
    return {
      module: AuthModule,
      controllers: [MeController, AuthController],
      providers: [
        SessionService,
        { provide: IDENTITY_VERIFIER, useClass: options.devSignIn ? DevIdentityVerifier : UnconfiguredIdentityVerifier },
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
