import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard.js';
import { AuthController } from './auth.controller.js';
import type { ApiConfig } from '../config.js';
import { googleTokenSource } from '../core/gcp.js';
import { DevIdentityVerifier, IDENTITY_VERIFIER, IdentityPlatformVerifier, UnconfiguredIdentityVerifier, type IdentityVerifier } from './identity.js';
import { MeController } from './me.controller.js';
import { SessionService } from './sessions.js';
import { SignInLinks } from './sign-in-links.js';

@Module({})
export class AuthModule {
  static register(options: Pick<ApiConfig, 'devSignIn' | 'identityPlatform'>): DynamicModule {
    return {
      module: AuthModule,
      // Tenant admins send sign-in links (SignInLinks) from AdminModule.
      global: true,
      controllers: [MeController, AuthController],
      providers: [
        SessionService,
        SignInLinks,
        { provide: IDENTITY_VERIFIER, useFactory: () => identityVerifier(options) },
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
      exports: [IDENTITY_VERIFIER, SignInLinks],
    };
  }
}

function identityVerifier(options: Pick<ApiConfig, 'devSignIn' | 'identityPlatform'>): IdentityVerifier {
  if (options.devSignIn) return new DevIdentityVerifier();
  if (options.identityPlatform) return new IdentityPlatformVerifier({ ...options.identityPlatform, tokens: googleTokenSource() });
  return new UnconfiguredIdentityVerifier();
}
