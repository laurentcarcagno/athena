import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
  );
  app.enableCors({ origin: config.CORS_ORIGIN, credentials: true });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_request, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'no-referrer');
      reply.header('Cache-Control', 'no-store');
    });
  await app.listen(config.PORT, config.HOST);
}

void bootstrap();
