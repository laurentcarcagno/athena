import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessContextInterceptor } from './core/access.interceptor';
import { AuthGuard } from './auth/auth.guard';
import { SESSION_STORE, TOKEN_VERIFIER, WEB_CONFIG, type WebConfig } from './auth/auth.tokens';
import { BffController } from './auth/bff.controller';
import { resolveSessionSecret } from './auth/secret';
import { PgSessionStore } from './auth/session';
import { OpenBao } from './secrets/openbao';
import { PG_POOL } from './core/core.tokens';
import type { Pool } from 'pg';
import { TokenVerifier } from './auth/token-verifier';
import { loadConfig } from './config';
import { CoreModule } from './core/core.module';
import { PpmModule } from './ppm/ppm.module';
import { OpenApiController } from './openapi/openapi.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [CoreModule, PpmModule],
  controllers: [HealthController, BffController, OpenApiController],
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
      useFactory: async (): Promise<WebConfig> => {
        const c = loadConfig();
        const bao = c.OPENBAO_ADDR && c.OPENBAO_TOKEN ? new OpenBao(c.OPENBAO_ADDR, c.OPENBAO_TOKEN) : null;
        const sessionSecret = await resolveSessionSecret(c.SESSION_SECRET, bao).catch((error: Error) => {
          console.error(`auth: secret de session indisponible : ${error.message.slice(0, 150)}`);
          return undefined; // l'authentification web répond alors 503 plutôt que d'utiliser un secret faible
        });
        return {
          issuer: c.KEYCLOAK_ISSUER, clientId: c.KEYCLOAK_WEB_CLIENT_ID, clientSecret: c.KEYCLOAK_WEB_CLIENT_SECRET,
          sessionSecret, publicUrl: c.PUBLIC_URL, webOrigin: c.WEB_ORIGIN, cookieSecure: c.COOKIE_SECURE, protectionLevel: c.ATHENA_PROTECTION_LEVEL,
          sessionTtlSeconds: c.SESSION_TTL_SECONDS,
        };
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AccessContextInterceptor },
  ],
})
export class AppModule {}
