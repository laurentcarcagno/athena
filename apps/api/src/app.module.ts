import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard, TOKEN_VERIFIER } from './auth/auth.guard';
import { TokenVerifier } from './auth/token-verifier';
import { loadConfig } from './config';
import { HealthController } from './health/health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: TOKEN_VERIFIER,
      useFactory: () => {
        const config = loadConfig();
        return TokenVerifier.forKeycloak(config.KEYCLOAK_ISSUER, config.KEYCLOAK_AUDIENCE);
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
