import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { applyHardening } from './security/hardening';

async function bootstrap() {
  const config = loadConfig();
  // rawBody : les signatures HMAC des webhooks entrants portent sur les octets exacts reçus.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: 1_048_576, trustProxy: config.TRUST_PROXY }), { rawBody: true });
  app.enableCors({ origin: config.CORS_ORIGIN, credentials: true });
  applyHardening(app.getHttpAdapter().getInstance(), {
    apiPerMinute: config.RATE_LIMIT_API_PER_MINUTE,
    sensitivePerMinute: config.RATE_LIMIT_SENSITIVE_PER_MINUTE,
    hsts: config.COOKIE_SECURE,
  });
  await app.listen(config.PORT, config.HOST);
}

void bootstrap();
