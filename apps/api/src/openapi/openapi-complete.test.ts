import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { OpenApiController } from './openapi.controller';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe('contrat OpenAPI exhaustif', () => {
  let app: NestFastifyApplication;
  let spec: { paths: Record<string, Record<string, { operationId: string }>> };
  beforeAll(async () => {
    process.env['DATABASE_URL'] = 'postgres://app:unused@127.0.0.1:1/none';
    process.env['KEYCLOAK_ISSUER'] = 'http://kc.test/realms/athena';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    spec = app.get(OpenApiController).spec() as never;
  }, 60_000);
  afterAll(async () => { await app?.close(); });

  it('décrit les routes de tous les contrôleurs de l’application (PPM, notifications, jetons, RGPD, webhooks…)', () => {
    const ids = new Set(Object.values(spec.paths).flatMap((p) => Object.values(p).map((o) => o.operationId)));
    for (const expected of ['Pat_create', 'Privacy_exportMine', 'Notify_list', 'Prioritization_ranking', 'Finance_project', 'Capacity_view', 'Metrics_scrape']) {
      expect([...ids].some((id) => id === expected), `${expected} absent du contrat`).toBe(true);
    }
    expect(Object.keys(spec.paths).length).toBeGreaterThan(150);
  });

  it('chaque classe *Controller du code source est décrite dans le contrat (aucune route oubliée)', () => {
    const files = walk(join(__dirname, '..')).filter((f) => f.endsWith('.controller.ts'));
    const described = new Set(Object.values(spec.paths).flatMap((p) => Object.values(p).map((o) => o.operationId.split('_')[0])));
    const missing: string[] = [];
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/export class (\w+)Controller\b/g)) if (!described.has(m[1]!)) missing.push(`${m[1]}Controller (${file.split(/[\/]/).slice(-2).join('/')})`);
    }
    expect(missing).toEqual([]);
  });
});
