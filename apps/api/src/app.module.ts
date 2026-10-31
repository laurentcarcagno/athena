import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { SESSION_STORE, TOKEN_VERIFIER, WEB_CONFIG, type WebConfig } from './auth/auth.tokens';
import { BffController } from './auth/bff.controller';
import { PgSessionStore } from './auth/session';
import { PG_POOL } from './core/core.tokens';
import type { Pool } from 'pg';
import { TokenVerifier } from './auth/token-verifier';
import { loadConfig } from './config';
import { CoreModule } from './core/core.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [CoreModule],
  controllers: [HealthController, BffController],
  providers: [
    {
      provide: TOKEN_VERIFIER,
      useFactory: () => {
        const config = loadConfig();
        return TokenVerifier.forKeycloak(config.KEYCLOAK_ISSUER, config.KEYCLOAK_AUDIENCE);
      },
    },
    { provide: SESSION_STORE, useFactory: (pool: Pool) => new PgSessionStore(pool), inject: [PG_POOL] },
    {
      provide: WEB_CONFIG,
      useFactory: (): WebConfig => {
        const c = loadConfig();
        return {
          issuer: c.KEYCLOAK_ISSUER, clientId: c.KEYCLOAK_WEB_CLIENT_ID, clientSecret: c.KEYCLOAK_WEB_CLIENT_SECRET,
          sessionSecret: c.SESSION_SECRET, publicUrl: c.PUBLIC_URL, webOrigin: c.WEB_ORIGIN, cookieSecure: c.COOKIE_SECURE,
          sessionTtlSeconds: c.SESSION_TTL_SECONDS,
        };
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
