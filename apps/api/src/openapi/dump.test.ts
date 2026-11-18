import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it } from 'vitest';
import { AppModule } from '../app.module';
import { OpenApiController } from './openapi.controller';

// Production du contrat OpenAPI complet dans un fichier (entrée de tools/gen-sdk.mjs) : `node tools/dump-openapi.mjs docs/api/openapi.json`.
(process.env['OPENAPI_OUT'] ? describe : describe.skip)('production du contrat OpenAPI', () => {
  it('écrit le document', async () => {
    process.env['DATABASE_URL'] = 'postgres://app:unused@127.0.0.1:1/none';
    process.env['KEYCLOAK_ISSUER'] = 'http://kc.test/realms/athena';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const out = process.env['OPENAPI_OUT']!;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(app.get(OpenApiController).spec(), null, 1));
    await app.close();
  }, 60_000);
});
